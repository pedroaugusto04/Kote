import crypto from 'node:crypto';

import { Injectable, NotFoundException } from '@nestjs/common';

import { CanonicalType, KnowledgeStatus } from '../../../contracts/enums.js';
import { ingestPayloadSchema, withDerivedReminderAt, type IngestPayload } from '../../../contracts/ingest.js';
import { buildNotePaths, renderEventNote } from '../../../domain/notes.js';
import type { Project } from '../../../domain/projects.js';
import { slugify, trimText } from '../../../domain/strings.js';
import { ContentRepository } from '../../ports/content.repository.js';
import { RuntimeEnvironmentProvider } from '../../ports/runtime-environment.port.js';

type IngestExecutionOptions = {
  folderId?: string;
};

@Injectable()
export class IngestEntryUseCase {
  constructor(
    private readonly contentRepository: ContentRepository,
    private readonly environmentProvider: RuntimeEnvironmentProvider,
  ) {}

  async execute(input: IngestPayload, userId: string, workspaceSlug = '', options: IngestExecutionOptions = {}) {
    return saveIngestedNote(
      this.contentRepository,
      userId,
      input,
      this.environmentProvider.read().reminderTimeZone,
      workspaceSlug,
      options,
    );
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
    aliases: [],
    defaultTags: [],
    enabled: true,
  };
}

async function saveIngestedNote(
  contentRepository: ContentRepository,
  userId: string,
  input: IngestPayload,
  reminderTimeZone: string,
  workspaceSlugOverride = '',
  options: IngestExecutionOptions = {},
) {
  const parsed = withDerivedReminderAt(ingestPayloadSchema.parse(input), reminderTimeZone);
  const workspaceSlug = slugify(workspaceSlugOverride || String(parsed.metadata.workspaceSlug || 'default')) || 'default';
  const workspace = (await contentRepository.listWorkspaces(userId)).find((item) => item.workspaceSlug === workspaceSlug);
  if (!workspace) throw new NotFoundException('workspace_not_found');
  const existingProject = (await contentRepository.listProjects(userId)).find(
    (item) => item.enabled && item.workspaceSlug === workspaceSlug && item.projectSlug === parsed.event.projectSlug,
  );
  const project = existingProject || projectFromPayload(parsed, workspaceSlug);
  const payload = {
    ...parsed,
    event: {
      ...parsed.event,
      projectSlug: project.projectSlug,
    },
    classification: {
      ...parsed.classification,
      status: parsed.classification.status || KnowledgeStatus.Active,
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
    path: paths.eventRelativePath.replace(/\\/g, '/'),
    type: CanonicalType.Event,
    title,
    projectSlug: project.projectSlug,
    workspaceSlug,
    folderId: folder?.id || null,
    status: payload.classification.status || KnowledgeStatus.Active,
    tags: payload.classification.tags,
    occurredAt: payload.event.occurredAt,
    sourceChannel: payload.source.channel,
    summary: payload.content.sections.summary || payload.content.rawText,
    markdown,
    frontmatter: {
      id: payload.source.correlationId,
      type: CanonicalType.Event,
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
    origin: 'postgres',
    source: payload.source.system,
    links: [paths.canonicalRelativePath, paths.followupRelativePath].filter(Boolean),
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
  };
}
