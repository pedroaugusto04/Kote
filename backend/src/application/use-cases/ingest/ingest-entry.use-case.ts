import { Injectable } from '@nestjs/common';

import { ingestPayloadSchema, withDerivedReminderAt, type IngestPayload } from '../../../contracts/ingest.js';
import { FolderNotFoundException } from '../../../domain/exceptions/index.js';
import { normalizeWorkspaceSlug } from '../../../domain/strings.js';
import { ContentRepository } from '../../ports/notes/content.repository.js';
import { RuntimeEnvironmentProvider } from '../../ports/observability/runtime-environment.port.js';
import type { SaveNoteResult } from '../../models/note-save-result.models.js';
import { NoteLifecycleService } from '../../services/content/note-lifecycle.service.js';
import { WorkspaceScopeResolver } from '../../services/content/workspace-scope-resolver.service.js';
import { TransactionManager } from '../../ports/persistence/transaction-manager.port.js';
import { toIngestPayloadWithProject, mapIngestedNote, toSaveNoteResult } from '../../mappers/ingest.mapper.js';
import { buildFolderSummary } from '../../utils/content/project-folder.utils.js';


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
    private readonly transactionManager: TransactionManager,
    private readonly scopeResolver: WorkspaceScopeResolver,
  ) {}

  execute(input: IngestPayload, userId: string, workspaceSlug = '', options: IngestExecutionOptions = {}): Promise<SaveNoteResult> {
    return this.transactionManager.runInTransaction(async (tx) => {
      const reminderTimeZone = this.environmentProvider.read().reminderTimeZone;
      return this.saveNote(input, userId, workspaceSlug, options, reminderTimeZone, tx);
    });
  }

  private async saveNote(
    input: IngestPayload,
    userId: string,
    workspaceSlugOverride: string,
    options: IngestExecutionOptions,
    reminderTimeZone: string,
    tx: unknown,
  ): Promise<SaveNoteResult> {
    const parsed = withDerivedReminderAt(ingestPayloadSchema.parse(input), reminderTimeZone);
    const workspaceSlug = normalizeWorkspaceSlug(workspaceSlugOverride || parsed.metadata.workspaceSlug);
    const workspace = await this.scopeResolver.resolveWorkspace(userId, workspaceSlug);
    const workspaceId = workspace.id;

    const { project, projectId } = await this.scopeResolver.resolveOrCreateProjectForIngest(
      userId,
      workspaceId,
      workspaceSlug,
      parsed,
      tx,
    );

    const payload = toIngestPayloadWithProject(parsed, project.projectSlug);
    const folder = options.folderId
      ? await this.contentRepository.getProjectFolderById(userId, projectId, options.folderId)
      : null;
    if (options.folderId && (!folder || folder.workspaceSlug !== workspaceSlug)) throw new FolderNotFoundException();

    const categoryIds = await this.scopeResolver.resolveOrCreateCategoryIds(
      userId,
      workspaceId,
      payload.classification.canonicalType,
      options.categoryIds,
      tx,
    );

    const noteInput = mapIngestedNote(payload, {
      project,
      workspaceId,
      workspaceSlug,
      folder,
      existingNoteId: options.existingNoteId,
      existingNotePath: options.existingNotePath,
      categoryIds,
    });

    const { note, attachments } = await this.noteLifecycleService.saveNote(
      userId,
      { noteInput, attachments: payload.content.attachments },
      { existingNoteId: options.existingNoteId, workspaceSlug, projectSlug: project.projectSlug },
      tx,
    );

    let folderSummary = { folderName: 'Project root', folderPath: 'Project root' };
    if (folder) {
      const folders = await this.contentRepository.listProjectFolders(userId, projectId);
      folderSummary = buildFolderSummary(folders, folder);
    }

    return toSaveNoteResult({
      note,
      attachments,
      project,
      folderName: folderSummary.folderName,
      folderPath: folderSummary.folderPath,
    });
  }
}
