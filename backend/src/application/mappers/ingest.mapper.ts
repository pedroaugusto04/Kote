import { slugify } from '../../domain/strings.js';
import type { Project } from '../../domain/projects.js';
import type { IngestPayload } from '../../contracts/ingest.js';
import type { SaveProjectInput } from '../models/repository-records.models.js';
import type { SaveNoteInput } from '../models/repository-records.models.js';
import type { SaveNoteResult } from '../models/note-save-result.models.js';
import type { NoteRecord } from '../models/repository-records.models.js';
import type { AttachmentRecord } from '../models/repository-records.models.js';
import { buildNotePaths, renderEventNote } from '../../domain/notes.js';
import { trimText } from '../../domain/strings.js';
import { normalizeManualNoteStatus, hasReminder } from '../../domain/note-status.js';
import { KnowledgeStatus } from '../../contracts/enums.js';
import { resolveCanonicalTypeFromCategories } from '../../domain/note-classification.js';

export function toProjectFromIngest(payload: IngestPayload, workspaceSlug: string): Project {
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

export function toIngestPayloadWithProject(parsed: IngestPayload, projectSlug: string): IngestPayload {
  const normalizedStatus = normalizeManualNoteStatus({
    requestedStatus: parsed.classification.status,
    currentStatus: KnowledgeStatus.Active,
    hadReminder: false,
    hasReminder: hasReminder({
      reminderAt: parsed.actions.reminderAt,
    }),
  });
  return {
    ...parsed,
    event: {
      ...parsed.event,
      projectSlug,
    },
    classification: {
      ...parsed.classification,
      status: normalizedStatus,
      tags: Array.from(new Set(parsed.classification.tags.map((tag) => slugify(tag)).filter(Boolean))),
    },
  };
}

export function toNoteInputFromIngest(
  payload: IngestPayload,
  project: Project,
  workspaceId: string,
  workspaceSlug: string,
  folderFullSlugPath: string | null,
  options: { existingNoteId?: string; existingNotePath?: string; categoryIds?: string[]; folderId?: string | null }
): SaveNoteInput {
  const paths = buildNotePaths(project, payload, folderFullSlugPath || '');
  const markdown = renderEventNote(project, payload, paths);
  const title = trimText(payload.content.title, payload.content.rawText);
  
  return {
    id: options.existingNoteId,
    projectId: '',
    workspaceId,
    path: options.existingNotePath || paths.eventRelativePath.replace(/\\/g, '/'),
    categoryIds: options.categoryIds,
    title,
    projectSlug: project.projectSlug,
    workspaceSlug,
    folderId: options.folderId || null,
    status: payload.classification.status || KnowledgeStatus.Active,
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
  };
}

export function toProjectSaveInput(project: Project, workspaceId: string, projectId: string): SaveProjectInput {
  return {
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
  };
}

export function toNotePathsFromIngest(
  payload: IngestPayload,
  project: Project,
  folderFullSlugPath: string | null
) {
  return buildNotePaths(project, payload, folderFullSlugPath || '');
}

export function toSaveNoteResult(
  note: NoteRecord,
  attachments: AttachmentRecord[],
  project: Project,
  folderName: string,
  folderPath: string,
  paths: ReturnType<typeof buildNotePaths>
): SaveNoteResult {
  const reminderAt = String(note.reminderAt || '');
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
      workspaceSlug: project.workspaceSlug,
      folderId: note.folderId,
      folderName,
      folderPath,
      eventPath: note.path,
      reminderAt,
      hasReminder: hasReminder({ reminderAt }),
      attachmentCount: attachments.length,
    },
  };
}
