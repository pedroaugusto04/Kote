import type {
  CreateNoteBody,
  UpdateNoteBody,
  NotesBySnippetQuery,
  NotesBySnippetBody,
  RelatedNotesByFileQuery,
  FileNotesSummaryQuery,
  NotesByFileQuery,
  AutoActionGlobal,
} from '../dto/note.dto.js';
import type { CreateManualNoteDto, UpdateNoteDto } from '../../../application/dto/note.dto.js';
import type { FindNotesBySnippetInput } from '../../../application/dto/snippet-notes.dto.js';
import type { FindRelatedNotesByFileInput } from '../../../application/use-cases/notes/find-related-notes-by-file.use-case.js';
import type { WorkspaceScope } from '../../../application/models/workspace-scope.models.js';

export function toCreateManualNoteDto(httpBody: CreateNoteBody, projectId?: string): CreateManualNoteDto {
  return {
    ...httpBody,
    projectId: projectId as string,
    categoryIds: httpBody.categoryIds || [],
    reminderAt: httpBody.reminderAt || '',
    sessionId: httpBody.sessionId || '',
    metadata: httpBody.metadata || {},
    attachments: httpBody.attachments || [],
  };
}

export function toUpdateNoteDto(httpBody: UpdateNoteBody, noteId: string, projectId?: string): UpdateNoteDto {
  return {
    ...httpBody,
    id: noteId,
    projectId,
    reminderAt: httpBody.reminderAt || '',
  };
}

export function toFindNotesBySnippetInput(
  request: NotesBySnippetQuery | NotesBySnippetBody,
  projectSlug?: string | null,
  workspaceSlug?: string | null,
): FindNotesBySnippetInput {
  return {
    filePath: request.filePath,
    codeSnippet: request.codeSnippet,
    projectSlug: projectSlug || request.projectSlug,
    workspaceSlug: workspaceSlug || request.workspaceSlug,
    gitContext: {
      commitHash: request.commitHash,
      commitHashes: request.commitHashes,
      author: request.author,
      commitDate: request.commitDate,
      commitMessage: request.commitMessage,
    },
    limit: request.limit,
  };
}

export function toFindRelatedNotesByFileInput(
  query: RelatedNotesByFileQuery,
  userId: string,
  scope?: WorkspaceScope,
): FindRelatedNotesByFileInput {
  return {
    userId,
    filePath: query.filePath,
    excludeIds: query.excludeIds,
    customQuery: query.query,
    projectSlug: scope?.projectSlug || query.projectSlug,
    requestedLimit: query.limit,
    searchProfile: query.searchProfile,
  };
}

export function toGenerateFileNotesSummaryInput(
  query: FileNotesSummaryQuery,
  scope?: WorkspaceScope,
) {
  return {
    filePath: query.filePath,
    workspaceSlug: scope?.workspaceSlug || query.workspaceSlug,
    projectSlug: scope?.projectSlug || query.projectSlug,
  };
}

export function toFindNotesByFileOptions(
  query: NotesByFileQuery,
  scope?: WorkspaceScope,
) {
  return {
    projectSlug: scope?.projectSlug || query.projectSlug,
  };
}

export function toSetAutoActionGlobalInput(body: AutoActionGlobal) {
  return {
    enabled: body.enabled,
    action: body.action,
    afterHours: body.afterHours ?? null,
  };
}
