import crypto from 'node:crypto';

import { Injectable, NotFoundException } from '@nestjs/common';

import { KnowledgeStatus } from '../../../contracts/enums.js';
import { ingestPayloadSchema, withDerivedReminderAt, type IngestPayload } from '../../../contracts/ingest.js';
import { hasReminder, normalizeManualNoteStatus } from '../../../domain/note-status.js';
import { buildNotePaths, renderEventNote } from '../../../domain/notes.js';
import type { Project } from '../../../domain/projects.js';
import { slugify, trimText } from '../../../domain/strings.js';
import { ContentRepository } from '../../ports/notes/content.repository.js';
import { EmbeddingQueuePublisher, EmbeddingJobType } from '../../ports/notes/embedding-queue.publisher.js';
import { RuntimeEnvironmentProvider } from '../../ports/observability/runtime-environment.port.js';
import type { ProjectFolderRecord } from '../../models/repository-records.models.js';
import type { SaveNoteResult } from '../../models/note-save-result.models.js';

type IngestExecutionOptions = {
  folderId?: string;
  existingNoteId?: string;
  existingNotePath?: string;
};

@Injectable()
export class IngestEntryUseCase {
  constructor(
    private readonly contentRepository: ContentRepository,
    private readonly environmentProvider: RuntimeEnvironmentProvider,
    private readonly embeddingQueue: EmbeddingQueuePublisher,
  ) {}

  async execute(input: IngestPayload, userId: string, workspaceSlug = '', options: IngestExecutionOptions = {}) {
    const result = await saveIngestedNote(
      this.contentRepository,
      userId,
      input,
      this.environmentProvider.read().reminderTimeZone,
      workspaceSlug,
      options,
    );

    try {
      await this.embeddingQueue.publish({ type: EmbeddingJobType.Index, userId, noteId: result.noteId });
    } catch { /* embedding queue failure must never block note save */ }

    return result;
  }
}

function projectFromPayload(payload: IngestPayload, workspaceSlug: string): Project {
  const projectSlug = slugify(payload.event.projectSlug) || 'inbox';
  const repoFullName = String(payload.metadata.repoFullName || '').trim();
  const repositories = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repoFullName)
    ? [{
        id: '',
        workspaceSlug,
        externalId: '0',
        fullName: repoFullName,
        htmlUrl: null,
        description: null,
        defaultBranch: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      }]
    : [];
  return {
    projectSlug,
    displayName: payload.event.projectSlug || 'Inbox',
    repositories,
    workspaceSlug,
    defaultTags: [],
    enabled: true,
    favorite: false,
  };
}

async function saveIngestedNote(
  contentRepository: ContentRepository,
  userId: string,
  input: IngestPayload,
  reminderTimeZone: string,
  workspaceSlugOverride = '',
  options: IngestExecutionOptions = {},
): Promise<SaveNoteResult> {
  const parsed = withDerivedReminderAt(ingestPayloadSchema.parse(input), reminderTimeZone);
  const workspaceSlug = slugify(workspaceSlugOverride || String(parsed.metadata.workspaceSlug || 'default')) || 'default';
  const workspace = (await contentRepository.listWorkspaces(userId)).find((item) => item.workspaceSlug === workspaceSlug);
  if (!workspace) throw new NotFoundException('workspace_not_found');
  const existingProject = (await contentRepository.listProjects(userId)).find(
    (item) => item.enabled && item.workspaceSlug === workspaceSlug && item.projectSlug === parsed.event.projectSlug,
  );
  const project = existingProject || projectFromPayload(parsed, workspaceSlug);
  const normalizedStatus = normalizeManualNoteStatus({
    requestedStatus: parsed.classification.status,
    currentStatus: KnowledgeStatus.Active,
    hadReminder: false,
    hasReminder: hasReminder({
      reminderDate: parsed.actions.reminderDate,
      reminderAt: parsed.actions.reminderAt,
    }),
  });
  const payload = {
    ...parsed,
    event: {
      ...parsed.event,
      projectSlug: project.projectSlug,
    },
    classification: {
      ...parsed.classification,
      status: normalizedStatus,
      tags: Array.from(new Set([project.projectSlug, ...project.defaultTags, ...parsed.classification.tags].map((tag) => slugify(tag)).filter(Boolean))),
    },
  };
  const folder = options.folderId
    ? await contentRepository.getProjectFolderById(userId, project.projectSlug, options.folderId)
    : null;
  if (options.folderId && (!folder || folder.workspaceSlug !== workspaceSlug)) throw new NotFoundException('folder_not_found');
  const paths = buildNotePaths(project, payload, folder?.fullSlugPath || '');
  const markdown = renderEventNote(project, payload, paths);
  const title = trimText(payload.content.title, payload.content.rawText);
  if (!existingProject) {
    if (project.repositories.length > 0) {
      const repo = project.repositories[0];
      const savedRepo = await contentRepository.upsertRepository({
        workspaceSlug: repo.workspaceSlug,
        externalId: repo.externalId,
        fullName: repo.fullName,
        htmlUrl: repo.htmlUrl,
        description: repo.description,
        defaultBranch: repo.defaultBranch,
      });
      project.repositories[0] = savedRepo;
    }
    await contentRepository.upsertProject(userId, project);
  }
  const note = await contentRepository.upsertNote(userId, {
    id: options.existingNoteId || undefined,
    path: options.existingNotePath || paths.eventRelativePath.replace(/\\/g, '/'),
    type: payload.classification.canonicalType,
    title,
    projectSlug: project.projectSlug,
    workspaceSlug,
    folderId: folder?.id || null,
    status: payload.classification.status,
    tags: payload.classification.tags,
    occurredAt: payload.event.occurredAt,
    sourceChannel: payload.source.channel,
    summary: payload.content.sections.summary || payload.content.rawText,
    markdown,
    frontmatter: {
      id: payload.source.correlationId,
      type: payload.classification.canonicalType,
      workspace: workspaceSlug,
      source_channel: payload.source.channel,
      event_type: payload.event.type,
      project: project.projectSlug,
      status: payload.classification.status,
      tags: payload.classification.tags,
      occurred_at: payload.event.occurredAt,
    },
    metadata: {
      ...payload.metadata,
      eventType: payload.event.type,
      impact: payload.content.sections.impact,
      reviewFindings: payload.content.sections.reviewFindings,
      reminderDate: payload.actions.reminderDate,
      reminderTime: payload.actions.reminderTime,
      reminderAt: payload.actions.reminderAt,
    },
  });
  const attachments = await Promise.all(
    payload.content.attachments.map((attachment) =>
      contentRepository.saveAttachment(userId, {
        noteId: note.id,
        fileName: attachment.fileName,
        mimeType: attachment.mimeType,
        sizeBytes: attachment.sizeBytes,
        dataBase64: attachment.dataBase64,
        checksumSha256: crypto.createHash('sha256').update(attachment.dataBase64 || '', 'base64').digest('hex'),
        metadata: { sourceCorrelationId: payload.source.correlationId },
      }),
    ),
  );
  const folderSummary = folder
    ? await buildFolderSummary(contentRepository, userId, project.projectSlug, folder)
    : { folderName: 'Project root', folderPath: 'Project root' };
  const reminderDate = String(payload.actions.reminderDate || '');
  const reminderTime = String(payload.actions.reminderTime || '');
  const reminderAt = String(payload.actions.reminderAt || '');
  return {
    ok: true,
    project: project.projectSlug,
    noteId: note.id,
    eventPath: note.path,
    canonicalPath: paths.canonicalRelativePath.replace(/\\/g, '/'),
    followupPath: paths.followupRelativePath.replace(/\\/g, '/'),
    dailyPath: paths.dailyRelativePath.replace(/\\/g, '/'),
    attachmentIds: attachments.map((attachment) => attachment.id),
    assetPaths: [],
    gitStatus: 'not_used_postgres',
    note: {
      id: note.id,
      title: note.title,
      type: hasReminder({ reminderDate, reminderAt }) ? 'reminder' : note.type,
      status: note.status,
      projectSlug: project.projectSlug,
      projectName: project.displayName || project.projectSlug,
      workspaceSlug,
      folderId: folder?.id || null,
      folderName: folderSummary.folderName,
      folderPath: folderSummary.folderPath,
      eventPath: note.path,
      reminderDate,
      reminderTime,
      reminderAt,
      hasReminder: hasReminder({ reminderDate, reminderAt }),
      attachmentCount: attachments.length,
    },
  };
}

async function buildFolderSummary(
  contentRepository: ContentRepository,
  userId: string,
  projectSlug: string,
  folder: ProjectFolderRecord,
) {
  const folders = await contentRepository.listProjectFolders(userId, projectSlug);
  const byId = new Map(folders.map((item) => [item.id, item]));
  const names: string[] = [];
  let current: ProjectFolderRecord | undefined = folder;
  while (current) {
    names.unshift(current.displayName);
    current = current.parentFolderId ? byId.get(current.parentFolderId) : undefined;
  }
  return {
    folderName: folder.displayName,
    folderPath: names.join(' / ') || folder.displayName,
  };
}
