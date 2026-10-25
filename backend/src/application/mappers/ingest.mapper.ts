import { slugify } from '../../domain/strings.js';
import type { Project } from '../../domain/projects.js';
import { ingestPayloadSchema, type IngestPayload } from '../../contracts/ingest.js';
import { CanonicalType, EventType, Importance, KnowledgeKind, KnowledgeStatus, type SourceChannel } from '../../contracts/enums.js';
import type { SaveProjectInput } from '../models/repository-records.models.js';
import type { SaveNoteInput } from '../models/repository-records.models.js';
import type { SaveNoteResult } from '../models/note-save-result.models.js';
import type { NoteRecord } from '../models/repository-records.models.js';
import type { AttachmentRecord } from '../models/repository-records.models.js';
import { buildNotePaths, renderEventNote } from '../../domain/notes.js';
import { normalizeOccurredAtToUtc } from '../../domain/time.js';
import { trimText } from '../../domain/strings.js';
import { normalizeManualNoteStatus, hasReminder } from '../../domain/note-status.js';
import { resolveCanonicalTypeFromCategories } from '../../domain/note-classification.js';

export interface BuildIngestPayloadInput {
  source: {
    channel?: SourceChannel | string;
    system: string;
    source?: string;
    actor?: string;
    conversationId?: string;
    correlationId: string;
    sessionId?: string;
  };
  event: {
    type: EventType;
    projectSlug: string;
    occurredAt?: string;
  };
  content?: {
    rawText?: string;
    title?: string;
    attachments?: Array<{
      fileName: string;
      mimeType?: string;
      sizeBytes?: number;
      dataBase64?: string;
    }>;
    sections?: {
      summary?: string;
      impact?: string;
      risks?: string | string[];
      nextSteps?: string | string[];
      reviewFindings?: any[];
    };
  };
  classification?: {
    kind?: KnowledgeKind;
    canonicalType?: CanonicalType;
    importance?: Importance;
    status?: KnowledgeStatus;
    tags?: string[];
    decisionFlag?: boolean;
  };
  actions?: {
    reminderAt?: string;
    reminderDate?: string;
    reminderTime?: string;
    followUpBy?: string;
  };
  links?: string[];
  metadata?: Record<string, unknown>;
}

export function buildIngestPayload(input: BuildIngestPayloadInput): IngestPayload {
  const risks = Array.isArray(input.content?.sections?.risks)
    ? input.content.sections.risks
    : (input.content?.sections?.risks ? [input.content.sections.risks] : []);

  const nextSteps = Array.isArray(input.content?.sections?.nextSteps)
    ? input.content.sections.nextSteps
    : (input.content?.sections?.nextSteps ? [input.content.sections.nextSteps] : []);

  const occurredAt = normalizeOccurredAtToUtc(input.event.occurredAt);

  return ingestPayloadSchema.parse({
    source: {
      channel: input.source.channel,
      system: input.source.system,
      source: input.source.source || '',
      actor: input.source.actor || '',
      conversationId: input.source.conversationId || '',
      correlationId: input.source.correlationId,
      sessionId: input.source.sessionId || '',
    },
    event: {
      type: input.event.type,
      occurredAt,
      projectSlug: input.event.projectSlug,
    },
    content: {
      rawText: input.content?.rawText || '',
      title: input.content?.title || '',
      attachments: input.content?.attachments || [],
      sections: {
        summary: input.content?.sections?.summary || '',
        impact: input.content?.sections?.impact || '',
        risks,
        nextSteps,
        reviewFindings: input.content?.sections?.reviewFindings || [],
      },
    },
    classification: {
      kind: input.classification?.kind ?? KnowledgeKind.Note,
      canonicalType: input.classification?.canonicalType ?? CanonicalType.Knowledge,
      importance: input.classification?.importance ?? Importance.Medium,
      status: input.classification?.status,
      tags: input.classification?.tags || [],
      decisionFlag: input.classification?.decisionFlag ?? false,
    },
    actions: {
      reminderAt: input.actions?.reminderAt || '',
      followUpBy: input.actions?.followUpBy || '',
    },
    links: input.links || [],
    metadata: input.metadata || {},
  });
}

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

export function toProjectFromRecord(existingProject: import('../models/repository-records.models.js').SaveProjectInput, fallbackWorkspaceSlug: string): Project {
  const workspaceSlug = existingProject.workspaceSlug || fallbackWorkspaceSlug;
  return {
    projectSlug: existingProject.projectSlug,
    displayName: existingProject.displayName,
    workspaceSlug,
    repositories: (existingProject.repositories || []).map((repo) => ({
      id: repo.id,
      workspaceSlug,
      externalId: repo.externalId,
      fullName: repo.fullName,
      htmlUrl: repo.htmlUrl,
      description: repo.description,
      defaultBranch: repo.defaultBranch,
      createdAt: repo.createdAt,
      updatedAt: repo.updatedAt,
    })),
    defaultTags: existingProject.defaultTags || [],
    enabled: existingProject.enabled !== false,
    favorite: Boolean(existingProject.favorite),
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

export interface IngestNoteMappingContext {
  project: Project;
  workspaceId: string;
  workspaceSlug: string;
  folderFullSlugPath?: string | null;
  folderId?: string | null;
  existingNoteId?: string;
  existingNotePath?: string;
  categoryIds?: string[];
}

export function toNoteInputFromIngest(
  payload: IngestPayload,
  context: IngestNoteMappingContext,
): SaveNoteInput {
  const {
    project,
    workspaceId,
    workspaceSlug,
    folderFullSlugPath,
    existingNoteId,
    existingNotePath,
    categoryIds,
    folderId = null,
  } = context;

  const paths = buildNotePaths(project, payload, folderFullSlugPath || '');
  const markdown = renderEventNote(project, payload, paths);
  const title = trimText(payload.content.title, payload.content.rawText);
  
  return {
    id: existingNoteId,
    projectId: '',
    workspaceId,
    path: existingNotePath || paths.eventRelativePath.replace(/\\/g, '/'),
    categoryIds,
    title,
    projectSlug: project.projectSlug,
    workspaceSlug,
    folderId,
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

export interface SaveNoteResultParams {
  note: NoteRecord;
  attachments: AttachmentRecord[];
  project: Project;
  folderName: string;
  folderPath: string;
  paths: ReturnType<typeof buildNotePaths>;
}

export function toSaveNoteResult(params: SaveNoteResultParams): SaveNoteResult {
  const { note, attachments: atts, project: proj, folderName, folderPath, paths } = params;
  const reminderAt = String(note.reminderAt || '');

  return {
    ok: true,
    project: proj.projectSlug,
    noteId: note.id,
    eventPath: note.path,
    canonicalPath: paths.canonicalRelativePath.replace(/\\/g, '/'),
    followupPath: paths.followupRelativePath.replace(/\\/g, '/'),
    dailyPath: paths.dailyRelativePath.replace(/\\/g, '/'),
    attachmentIds: atts.map((attachment) => attachment.id),
    assetPaths: [],
    note: {
      id: note.id,
      title: note.title,
      type: hasReminder({ reminderAt }) ? 'reminder' : resolveCanonicalTypeFromCategories(note.categories || [], (note.categories || []).map((c) => c.id)),
      status: note.status,
      projectSlug: proj.projectSlug,
      projectName: proj.displayName || proj.projectSlug,
      workspaceSlug: proj.workspaceSlug,
      folderId: note.folderId,
      folderName,
      folderPath,
      eventPath: note.path,
      reminderAt,
      hasReminder: hasReminder({ reminderAt }),
      attachmentCount: atts.length,
    },
  };
}
