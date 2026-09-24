import crypto from 'node:crypto';

import { Injectable, NotFoundException } from '@nestjs/common';

import { ingestPayloadSchema, withDerivedReminderAt, type IngestPayload } from '../../../contracts/ingest.js';
import type { Project } from '../../../domain/projects.js';
import { slugify } from '../../../domain/strings.js';
import { ContentRepository } from '../../ports/notes/content.repository.js';
import { RuntimeEnvironmentProvider } from '../../ports/observability/runtime-environment.port.js';
import type { ProjectFolderRecord } from '../../models/repository-records.models.js';
import type { SaveNoteResult } from '../../models/note-save-result.models.js';
import { NoteLifecycleService } from '../../services/content/note-lifecycle.service.js';
import { AppLogger } from '../../../observability/logger.js';
import { PostgresDatabase } from '../../../infrastructure/persistence/database.js';
import { toProjectFromIngest, toProjectFromRecord, toIngestPayloadWithProject, toNoteInputFromIngest, toProjectSaveInput, toNotePathsFromIngest, toSaveNoteResult } from '../../mappers/ingest.mapper.js';
import { buildFolderSummary } from '../../utils/content/project-folder.utils.js';
import { resolveCategoryIds } from '../../utils/content/category-resolution.utils.js';



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
    private readonly database: PostgresDatabase,
  ) {}

  async execute(input: IngestPayload, userId: string, workspaceSlug = '', options: IngestExecutionOptions = {}) {
    return this.database.getDb().transaction(async (tx) => {
      const result = await saveIngestedNote({
        contentRepository: this.contentRepository,
        noteLifecycleService: this.noteLifecycleService,
        userId,
        input,
        reminderTimeZone: this.environmentProvider.read().reminderTimeZone,
        workspaceSlugOverride: workspaceSlug,
        options,
        tx,
      });

      return result;
    });
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
}

async function syncNewProject(
  contentRepository: ContentRepository,
  project: Project,
  workspaceId: string,
  workspaceSlug: string,
  projectId: string,
  userId: string,
  tx?: any,
) {
  if (project.repositories.length) {
    const repo = project.repositories[0]!;
    const savedRepo = await contentRepository.upsertRepository({
      workspaceId,
      externalId: repo.externalId,
      fullName: repo.fullName,
      htmlUrl: repo.htmlUrl,
      description: repo.description,
      defaultBranch: repo.defaultBranch,
    }, tx);
    project.repositories[0] = {
      ...savedRepo,
      workspaceSlug,
    };
  }
  const projectSaveInput = toProjectSaveInput(project, workspaceId, projectId);
  await contentRepository.upsertProject(userId, projectSaveInput);
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
  } = params;

  const parsed = withDerivedReminderAt(ingestPayloadSchema.parse(input), reminderTimeZone);
  const workspaceSlug = slugify(workspaceSlugOverride || String(parsed.metadata.workspaceSlug || 'default')) || 'default';
  const workspace = await contentRepository.getWorkspaceBySlug(userId, workspaceSlug);
  if (!workspace) throw new NotFoundException('workspace_not_found');
  const workspaceId = workspace.id;

  const existingProject = await contentRepository.getProjectBySlug(userId, parsed.event.projectSlug);
  const isMatchingProject = existingProject && existingProject.enabled && existingProject.workspaceId === workspaceId;
  const projectId = isMatchingProject ? existingProject.id : crypto.randomUUID();

  const project: Project = isMatchingProject
    ? toProjectFromRecord(existingProject, workspaceSlug)
    : toProjectFromIngest(parsed, workspaceSlug);
  
  const payload = toIngestPayloadWithProject(parsed, project.projectSlug);
  const folder = options.folderId
    ? await contentRepository.getProjectFolderById(userId, projectId, options.folderId)
    : null;
  if (options.folderId && (!folder || folder.workspaceSlug !== workspaceSlug)) throw new NotFoundException('folder_not_found');
  
  if (!isMatchingProject) {
    await syncNewProject(contentRepository, project, workspaceId, workspaceSlug, projectId, userId, tx);
  }

  const categoryIds = await resolveCategoryIds(
    contentRepository,
    userId,
    workspaceId,
    payload.classification.canonicalType,
    options.categoryIds,
    tx,
  );

  const { note, attachments } = await noteLifecycleService.saveNote(
    userId,
    {
      noteInput: toNoteInputFromIngest(payload, project, workspaceId, workspaceSlug, folder?.fullSlugPath || null, {
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
  return toSaveNoteResult(note, attachments, project, folderSummary.folderName, folderSummary.folderPath, paths);
}
