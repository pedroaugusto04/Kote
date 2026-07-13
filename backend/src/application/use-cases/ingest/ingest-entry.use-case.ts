import crypto from 'node:crypto';

import { Injectable, NotFoundException } from '@nestjs/common';

import { KnowledgeStatus } from '../../../contracts/enums.js';
import { ingestPayloadSchema, withDerivedReminderAt, type IngestPayload } from '../../../contracts/ingest.js';
import { hasReminder, normalizeManualNoteStatus } from '../../../domain/note-status.js';
import { buildNotePaths, renderEventNote } from '../../../domain/notes.js';
import type { Project } from '../../../domain/projects.js';
import { slugify, trimText, calculateAttachmentSize } from '../../../domain/strings.js';
import { ContentRepository } from '../../ports/notes/content.repository.js';
import { RuntimeEnvironmentProvider } from '../../ports/observability/runtime-environment.port.js';
import type { ProjectFolderRecord } from '../../models/repository-records.models.js';
import type { SaveNoteResult } from '../../models/note-save-result.models.js';
import { resolveCanonicalTypeFromCategories } from '../../../domain/note-classification.js';
import { NoteLifecycleService } from '../../services/note-lifecycle.service.js';
import { AppLogger } from '../../../observability/logger.js';


type IngestExecutionOptions = {
  folderId?: string;
  existingNoteId?: string;
  existingNotePath?: string;
  categoryIds?: string[];
};

@Injectable()
export class IngestEntryUseCase {
  constructor(
    private readonly contentRepository: ContentRepository,
    private readonly environmentProvider: RuntimeEnvironmentProvider,
    private readonly noteLifecycleService: NoteLifecycleService,
    private readonly logger: AppLogger,
  ) {}

  async execute(input: IngestPayload, userId: string, workspaceSlug = '', options: IngestExecutionOptions = {}) {
    const result = await saveIngestedNote(
      this.contentRepository,
      this.noteLifecycleService,
      userId,
      input,
      this.environmentProvider.read().reminderTimeZone,
      workspaceSlug,
      options,
    );

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
  noteLifecycleService: NoteLifecycleService,
  userId: string,
  input: IngestPayload,
  reminderTimeZone: string,
  workspaceSlugOverride = '',
  options: IngestExecutionOptions = {},
): Promise<SaveNoteResult> {
  const parsed = withDerivedReminderAt(ingestPayloadSchema.parse(input), reminderTimeZone);
  const workspaceSlug = slugify(workspaceSlugOverride || String(parsed.metadata.workspaceSlug || 'default')) || 'default';
  const workspace = await contentRepository.getWorkspaceBySlug(userId, workspaceSlug);
  if (!workspace) throw new NotFoundException('workspace_not_found');
  const workspaceId = workspace.id;

  const existingProject = await contentRepository.getProjectBySlug(userId, parsed.event.projectSlug);
  const isMatchingProject = existingProject && existingProject.enabled && existingProject.workspaceId === workspaceId;
  const projectId = isMatchingProject ? existingProject.id : crypto.randomUUID();

  const project: Project = isMatchingProject
    ? {
      projectSlug: existingProject.projectSlug,
      displayName: existingProject.displayName,
      workspaceSlug: existingProject.workspaceSlug || workspaceSlug,
      repositories: existingProject.repositories.map((repo) => ({
        id: repo.id,
        workspaceSlug: existingProject.workspaceSlug || workspaceSlug,
        externalId: repo.externalId,
        fullName: repo.fullName,
        htmlUrl: repo.htmlUrl,
        description: repo.description,
        defaultBranch: repo.defaultBranch,
        createdAt: repo.createdAt,
        updatedAt: repo.updatedAt,
      })),
      defaultTags: existingProject.defaultTags,
      enabled: existingProject.enabled,
      favorite: existingProject.favorite,
    }
    : projectFromPayload(parsed, workspaceSlug);
  const normalizedStatus = normalizeManualNoteStatus({
    requestedStatus: parsed.classification.status,
    currentStatus: KnowledgeStatus.Active,
    hadReminder: false,
    hasReminder: hasReminder({
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
      tags: Array.from(new Set(parsed.classification.tags.map((tag) => slugify(tag)).filter(Boolean))),
    },
  };
  const folder = options.folderId
    ? await contentRepository.getProjectFolderById(userId, projectId, options.folderId)
    : null;
  if (options.folderId && (!folder || folder.workspaceSlug !== workspaceSlug)) throw new NotFoundException('folder_not_found');
  const paths = buildNotePaths(project, payload, folder?.fullSlugPath || '');
  const markdown = renderEventNote(project, payload, paths);
  const title = trimText(payload.content.title, payload.content.rawText);
  if (!isMatchingProject) {
    if (project.repositories.length > 0) {
      const repo = project.repositories[0]!;
      const savedRepo = await contentRepository.upsertRepository({
        workspaceId,
        externalId: repo.externalId,
        fullName: repo.fullName,
        htmlUrl: repo.htmlUrl,
        description: repo.description,
        defaultBranch: repo.defaultBranch,
      });
      project.repositories[0] = {
        ...savedRepo,
        workspaceSlug: workspaceSlug,
      };
    }
    await contentRepository.upsertProject(userId, {
      id: projectId,
      projectSlug: project.projectSlug,
      displayName: project.displayName,
      workspaceId,
      workspaceSlug: project.workspaceSlug,
      repositories: project.repositories.map((repo) => ({
        id: repo.id,
        workspaceId,
        workspaceSlug: repo.workspaceSlug,
        externalId: repo.externalId,
        fullName: repo.fullName,
        htmlUrl: repo.htmlUrl,
        description: repo.description,
        defaultBranch: repo.defaultBranch,
        createdAt: repo.createdAt,
        updatedAt: repo.updatedAt,
      })),
      defaultTags: project.defaultTags,
      enabled: project.enabled,
      favorite: project.favorite,
    });
  }
  let categoryIds = options.categoryIds;
  if (categoryIds === undefined) {
    const categoryName = payload.classification.canonicalType;
    if (categoryName) {
      let category = await contentRepository.findCategoryByName(userId, workspaceId, categoryName);
      if (!category) {
        category = await contentRepository.createCategory(userId, workspaceId, {
          name: categoryName,
          color: '#9e9e9e',
          icon: '',
        });
      }
      categoryIds = [category.id];
    } else {
      categoryIds = [];
    }
  }

  const { note, attachments } = await noteLifecycleService.saveNote(
    userId,
    {
      noteInput: {
        id: options.existingNoteId || undefined,
        projectId,
        workspaceId,
        path: options.existingNotePath || paths.eventRelativePath.replace(/\\/g, '/'),
        categoryIds,
        title,
        projectSlug: project.projectSlug,
        workspaceSlug,
        folderId: folder?.id || null,
        status: payload.classification.status,
        tags: payload.classification.tags,
        occurredAt: payload.event.occurredAt,
        sourceChannel: payload.source.channel,
        summary: payload.content.sections.summary || '',
        markdown,
        metadata: {
          ...payload.metadata,
          eventType: payload.event.type,
          impact: payload.content.sections.impact,
          reviewFindings: payload.content.sections.reviewFindings,
        },
        source: payload.source.system,
        sessionId: payload.source.sessionId,
        reminderAt: payload.actions.reminderAt,
        links: payload.links,
      },
      attachments: payload.content.attachments,
    },
    {
      existingNoteId: options.existingNoteId,
      workspaceSlug,
      projectSlug: project.projectSlug,
    }
  );
  const folderSummary = folder
    ? await buildFolderSummary(contentRepository, userId, projectId, folder)
    : { folderName: 'Project root', folderPath: 'Project root' };
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
    note: {
      id: note.id,
      title: note.title,
      type: hasReminder({ reminderAt }) ? 'reminder' : resolveCanonicalTypeFromCategories(note.categories || [], (note.categories || []).map((c) => c.id)),
      status: note.status,
      projectSlug: project.projectSlug,
      projectName: project.displayName || project.projectSlug,
      workspaceSlug,
      folderId: folder?.id || null,
      folderName: folderSummary.folderName,
      folderPath: folderSummary.folderPath,
      eventPath: note.path,
      reminderAt,
      hasReminder: hasReminder({ reminderAt }),
      attachmentCount: attachments.length,
    },
  };
}

async function buildFolderSummary(
  contentRepository: ContentRepository,
  userId: string,
  projectId: string,
  folder: ProjectFolderRecord,
) {
  const folders = await contentRepository.listProjectFolders(userId, projectId);
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
