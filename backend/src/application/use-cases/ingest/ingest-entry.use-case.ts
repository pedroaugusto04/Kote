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
import { toProjectFromIngest, toIngestPayloadWithProject, toNoteInputFromIngest, toProjectSaveInput, toNotePathsFromIngest, toSaveNoteResult } from '../../mappers/ingest.mapper.js';


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
      const result = await saveIngestedNote(
        this.contentRepository,
        this.noteLifecycleService,
        userId,
        input,
        this.environmentProvider.read().reminderTimeZone,
        workspaceSlug,
        options,
        tx,
      );

      return result;
    });
  }
}

async function saveIngestedNote(
  contentRepository: ContentRepository,
  noteLifecycleService: NoteLifecycleService,
  userId: string,
  input: IngestPayload,
  reminderTimeZone: string,
  workspaceSlugOverride = '',
  options: IngestExecutionOptions = {},
  tx?: any
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
    : toProjectFromIngest(parsed, workspaceSlug);
  
  const payload = toIngestPayloadWithProject(parsed, project.projectSlug);
  const folder = options.folderId
    ? await contentRepository.getProjectFolderById(userId, projectId, options.folderId)
    : null;
  if (options.folderId && (!folder || folder.workspaceSlug !== workspaceSlug)) throw new NotFoundException('folder_not_found');
  
  if (!isMatchingProject && project.repositories.length) {
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
      workspaceSlug: workspaceSlug,
    };
  }
  if (!isMatchingProject) {
    const projectSaveInput = toProjectSaveInput(project, workspaceId, projectId);
    await contentRepository.upsertProject(userId, projectSaveInput);
  }
  let categoryIds = options.categoryIds;
  if (categoryIds === undefined) {
    const categoryName = payload.classification.canonicalType;
    if (categoryName) {
      let category = await contentRepository.findCategoryByName(userId, workspaceId, categoryName, tx);
      if (!category) {
        category = await contentRepository.createCategory(userId, workspaceId, {
          name: categoryName,
          color: '#9e9e9e',
          icon: '',
        }, tx);
      }
      categoryIds = [category.id];
    } else {
      categoryIds = [];
    }
  }

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
  const folderSummary = folder
    ? await buildFolderSummary(contentRepository, userId, projectId, folder)
    : { folderName: 'Project root', folderPath: 'Project root' };
  const paths = toNotePathsFromIngest(payload, project, folder?.fullSlugPath || null);
  return toSaveNoteResult(note, attachments, project, folderSummary.folderName, folderSummary.folderPath, paths);
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
