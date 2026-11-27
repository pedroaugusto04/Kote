import { Injectable } from '@nestjs/common';

import { ingestPayloadSchema, withDerivedReminderAt, type IngestPayload } from '../../../contracts/ingest.js';
import { FolderNotFoundException } from '../../../domain/exceptions/index.js';
import type { Project } from '../../../domain/projects.js';
import { normalizeWorkspaceSlug } from '../../../domain/strings.js';
import { ContentRepository } from '../../ports/notes/content.repository.js';
import { RuntimeEnvironmentProvider } from '../../ports/observability/runtime-environment.port.js';
import type { ProjectFolderRecord } from '../../models/repository-records.models.js';
import type { SaveNoteResult } from '../../models/note-save-result.models.js';
import { NoteLifecycleService } from '../../services/content/note-lifecycle.service.js';
import { WorkspaceScopeResolver } from '../../services/content/workspace-scope-resolver.service.js';
import { AppLogger } from '../../../observability/logger.js';
import { TransactionManager } from '../../ports/persistence/transaction-manager.port.js';
import { toIngestPayloadWithProject, toNoteInputFromIngest, toNotePathsFromIngest, toSaveNoteResult } from '../../mappers/ingest.mapper.js';
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
    private readonly logger: AppLogger,
    private readonly transactionManager: TransactionManager,
    private readonly scopeResolver: WorkspaceScopeResolver,
  ) {}

  async execute(input: IngestPayload, userId: string, workspaceSlug = '', options: IngestExecutionOptions = {}) {
    const run = async (tx?: any) => {
      const result = await saveIngestedNote({
        contentRepository: this.contentRepository,
        noteLifecycleService: this.noteLifecycleService,
        userId,
        input,
        reminderTimeZone: this.environmentProvider.read().reminderTimeZone,
        workspaceSlugOverride: workspaceSlug,
        options,
        tx,
        scopeResolver: this.scopeResolver,
      });

      return result;
    };

    if (typeof (this.transactionManager as any)?.runInTransaction === 'function') {
      return this.transactionManager.runInTransaction(run);
    }
    if (typeof (this.transactionManager as any)?.getDb === 'function') {
      return (this.transactionManager as any).getDb().transaction(run);
    }
    return run();
  }
}

export interface SaveIngestedNoteParams {
  contentRepository: ContentRepository;
  noteLifecycleService: NoteLifecycleService;
  userId: string;
  input: IngestPayload;
  reminderTimeZone: string;
  workspaceSlugOverride?: string;
  options?: IngestExecutionOptions;
  tx?: any;
  scopeResolver: WorkspaceScopeResolver;
}

async function saveIngestedNote(params: SaveIngestedNoteParams): Promise<SaveNoteResult> {
  const {
    contentRepository,
    noteLifecycleService,
    userId,
    input,
    reminderTimeZone,
    workspaceSlugOverride = '',
    options = {},
    tx,
    scopeResolver,
  } = params;

  const parsed = withDerivedReminderAt(ingestPayloadSchema.parse(input), reminderTimeZone);
  const workspaceSlug = normalizeWorkspaceSlug(workspaceSlugOverride || parsed.metadata.workspaceSlug);
  const workspace = await scopeResolver.resolveWorkspace(userId, workspaceSlug);
  const workspaceId = workspace.id;

  const { project, projectId } = await scopeResolver.resolveOrCreateProjectForIngest(
    userId,
    workspaceId,
    workspaceSlug,
    parsed,
    tx,
  );

  const payload = toIngestPayloadWithProject(parsed, project.projectSlug);
  const folder = options.folderId
    ? await contentRepository.getProjectFolderById(userId, projectId, options.folderId)
    : null;
  if (options.folderId && (!folder || folder.workspaceSlug !== workspaceSlug)) throw new FolderNotFoundException();

  const categoryIds = await scopeResolver.resolveOrCreateCategoryIds(
    userId,
    workspaceId,
    payload.classification.canonicalType,
    options.categoryIds,
    tx,
  );

  const { note, attachments } = await noteLifecycleService.saveNote(
    userId,
    {
      noteInput: toNoteInputFromIngest(payload, {
        project,
        workspaceId,
        workspaceSlug,
        folderFullSlugPath: folder?.fullSlugPath || null,
        existingNoteId: options.existingNoteId,
        existingNotePath: options.existingNotePath,
        categoryIds,
        folderId: folder?.id || null,
      }),
      attachments: payload.content.attachments,
    },
    {
      existingNoteId: options.existingNoteId,
      workspaceSlug,
      projectSlug: project.projectSlug,
    },
    tx,
  );

  let folderSummary = { folderName: 'Project root', folderPath: 'Project root' };
  if (folder) {
    const folders = await contentRepository.listProjectFolders(userId, projectId);
    folderSummary = buildFolderSummary(folders, folder);
  }

  const paths = toNotePathsFromIngest(payload, project, folder?.fullSlugPath || null);
  return toSaveNoteResult({
    note,
    attachments,
    project,
    folderName: folderSummary.folderName,
    folderPath: folderSummary.folderPath,
    paths,
  });
}
