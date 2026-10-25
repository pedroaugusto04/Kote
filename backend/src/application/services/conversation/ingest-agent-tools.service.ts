import { Injectable } from '@nestjs/common';

import { ContentRepository } from '../../ports/notes/content.repository.js';
import { AppLogger } from '../../../observability/logger.js';
import type { AgentTool } from '../../../contracts/agent-tool.js';
import { WorkspaceScopeResolver } from '../content/workspace-scope-resolver.service.js';
import { buildProjectFolderTree } from '../../utils/content/project-folder.utils.js';
import { serializeFolderTreeNode } from '../../use-cases/conversation/services/conversation-agent-state-machine.js';
import { KnowledgeStatus } from '../../../contracts/enums.js';
import { StatusFilter, reminderListStatusFilterValues } from '../../../contracts/status-filters.js';
import { ListPaginatedRemindersUseCase } from '../../use-cases/reminders/list-paginated-reminders.use-case.js';
import { CreateProjectFolderUseCase } from '../../use-cases/projects/create-project-folder.use-case.js';
import {
  DEFAULT_APP_TIMEZONE,
  formatDateTimeInTimeZone,
  getTimeZoneOffsetString,
  normalizeReminderAtToUtc,
  normalizeTimeZone,
} from '../../../domain/time.js';

@Injectable()
export class IngestAgentToolsService {
  constructor(
    private readonly contentRepository: ContentRepository,
    private readonly logger: AppLogger,
    private readonly listPaginatedReminders: ListPaginatedRemindersUseCase,
    private readonly folderCreator: CreateProjectFolderUseCase,
    private readonly scopeResolver: WorkspaceScopeResolver,
  ) {}

  buildTools(userId: string, workspaceSlug: string, reminderTimeZone = DEFAULT_APP_TIMEZONE): AgentTool[] {
    const zone = normalizeTimeZone(reminderTimeZone);
    const zoneOffset = getTimeZoneOffsetString(new Date(), zone);
    const listProjectsTool: AgentTool = {
      name: 'list_projects',
      description: "List all active projects in the user's workspace with their names and slugs.",
      parameters: {
        type: 'object',
        properties: {},
      },
      execute: async () => {
        this.logger.info('ingest_agent.tool.list_projects', { userId, workspaceSlug });
        const allProjects = await this.contentRepository.listProjects(userId);
        const filtered = allProjects.filter(
          (p) => p.enabled && p.workspaceSlug === workspaceSlug,
        );
        return {
          projects: filtered.map((p) => ({
            displayName: p.displayName,
            projectSlug: p.projectSlug,
            defaultTags: p.defaultTags || [],
          })),
        };
      },
    };

    const listProjectFoldersTool: AgentTool = {
      name: 'list_project_folders',
      description:
        'List the folder hierarchy of a specific project by its projectSlug. ALWAYS call this when a project or folder is mentioned to retrieve valid folder IDs.',
      parameters: {
        type: 'object',
        properties: {
          projectSlug: {
            type: 'string',
            description: 'The slug of the project whose folders should be inspected.',
          },
        },
        required: ['projectSlug'],
      },
      execute: async (args: Record<string, any>) => {
        const projectSlug = String(args.projectSlug || '').trim().toLowerCase();
        if (!projectSlug) {
          return { error: 'projectSlug parameter is required' };
        }

        this.logger.info('ingest_agent.tool.list_project_folders', { userId, projectSlug });
        if (projectSlug === 'inbox') {
          return { projectSlug: 'inbox', folders: [] };
        }

        const scope = await this.scopeResolver.resolveContentScopeFromSlugs(userId, {
          workspaceSlug,
          projectSlug,
        });

        if (!scope.project?.enabled) {
          return {
            projectSlug,
            error: `Project '${projectSlug}' not found. If this is a new project, its folders are currently empty.`,
            folders: [],
          };
        }

        const folders = await this.contentRepository.listProjectFolders(userId, scope.project.id);
        const tree = buildProjectFolderTree(folders).map(serializeFolderTreeNode);

        return {
          projectSlug,
          folderCount: folders.length,
          folders: folders.map((f) => ({
            id: f.id,
            displayName: f.displayName,
            fullSlugPath: f.fullSlugPath,
            parentFolderId: f.parentFolderId,
          })),
          tree,
        };
      },
    };

    const createProjectFolderTool: AgentTool = {
      name: 'create_project_folder',
      description:
        'Create a new folder in a project. If parentFolderId is provided, the folder is created inside that parent folder; otherwise it is created at the root level of the project. Always call list_projects and list_project_folders first to obtain the exact projectSlug and parentFolderId.',
      parameters: {
        type: 'object',
        properties: {
          projectSlug: {
            type: 'string',
            description: 'The slug of the project where the folder should be created.',
          },
          folderName: {
            type: 'string',
            description: 'The display name for the new folder (e.g. "Reunioes", "Deployments").',
          },
          parentFolderId: {
            type: 'string',
            description: 'Optional UUID of an existing parent folder to nest this folder inside.',
          },
        },
        required: ['projectSlug', 'folderName'],
      },
      execute: async (args: Record<string, any>) => {
        const projectSlug = String(args.projectSlug || '').trim().toLowerCase();
        const folderName = String(args.folderName || '').trim();
        const parentFolderId = args.parentFolderId ? String(args.parentFolderId).trim() : undefined;

        if (!projectSlug || !folderName) {
          return { error: 'projectSlug and folderName are required.' };
        }

        if (projectSlug === 'inbox') {
          return { error: 'Folders cannot be created in the inbox project.' };
        }

        const scope = await this.scopeResolver.resolveContentScopeFromSlugs(userId, {
          workspaceSlug,
          projectSlug,
        });

        if (!scope.project?.enabled) {
          return { error: `Project '${projectSlug}' not found.` };
        }

        try {
          const result = await this.folderCreator.execute(
            {
              projectId: scope.project.id,
              displayName: folderName,
              parentFolderId: parentFolderId || undefined,
            },
            userId,
          );

          this.logger.info('ingest_agent.tool.create_project_folder', {
            userId,
            projectSlug,
            folderName,
            folderId: result.folder.id,
          });

          return {
            ok: true,
            folder: {
              id: result.folder.id,
              displayName: result.folder.displayName,
              folderSlug: result.folder.folderSlug,
              fullSlugPath: result.folder.fullSlugPath,
              parentFolderId: result.folder.parentFolderId,
              projectSlug,
            },
          };
        } catch (error: any) {
          const message = error?.response?.details?.fieldErrors?.displayName
            || error?.message
            || (error?.response?.code ? String(error.response.code) : 'Failed to create folder');
          return { error: message };
        }
      },
    };

    const listRemindersTool: AgentTool = {
      name: 'list_reminders',
      description:
        'Search reminders in this connected workspace. Filter by text, project, status, or due-date range; results are ordered by date and paginated. Use a later page only when more matches are needed. Call this before changing a reminder to obtain its exact ID.',
      parameters: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: 'Optional keywords in the title or reminder text.',
          },
          projectSlug: {
            type: 'string',
            description: 'Optional project slug to filter by.',
          },
          status: {
            type: 'string',
            enum: [...reminderListStatusFilterValues],
            description: 'Optional status: open, all, pending, overdue, sent, resolved, or archived. Defaults to all so sent reminders can also be found.',
          },
          dueAfter: {
            type: 'string',
            description: 'Optional inclusive ISO-8601 lower bound for the scheduled time.',
          },
          dueBefore: {
            type: 'string',
            description: 'Optional inclusive ISO-8601 upper bound for the scheduled time.',
          },
          page: {
            type: 'integer',
            description: '1-based page number. Defaults to 1.',
          },
          pageSize: {
            type: 'integer',
            description: 'Results per page, from 1 to 50. Defaults to 10.',
          },
        },
      },
      execute: async (args: Record<string, any>) => {
        const page = this.clampInteger(args.page, 1, 1, Number.MAX_SAFE_INTEGER);
        const pageSize = this.clampInteger(args.pageSize, 10, 1, 50);
        const dueAfter = this.parseOptionalDate(args.dueAfter, zone);
        const dueBefore = this.parseOptionalDate(args.dueBefore, zone);

        if (dueAfter === null || dueBefore === null) {
          return {
            error: 'dueAfter and dueBefore must be valid ISO-8601 timestamps.',
          };
        }

        if (dueAfter && dueBefore && Date.parse(dueAfter) > Date.parse(dueBefore)) {
          return {
            error: 'dueAfter must be earlier than or equal to dueBefore.',
          };
        }

        const status = String(args.status || StatusFilter.All).trim().toLowerCase();
        if (!reminderListStatusFilterValues.includes(status as typeof reminderListStatusFilterValues[number])) {
          return {
            error: 'Unsupported reminder status filter.',
          };
        }

        const result = await this.listPaginatedReminders.execute(userId, {
          page,
          pageSize,
          workspaceSlug,
          projectSlug: String(args.projectSlug || '').trim().toLowerCase() || undefined,
          query: String(args.query || '').trim().slice(0, 160) || undefined,
          status,
          dueAfter: dueAfter || undefined,
          dueBefore: dueBefore || undefined,
        });

        return {
          items: result.items.map(({ id, title, project, status: reminderStatus, reminderAt }) => ({
            id,
            title,
            project,
            status: reminderStatus,
            reminderAt,
            formattedReminderAt: reminderAt
              ? formatDateTimeInTimeZone(new Date(reminderAt), zone)
              : '',
          })),
          pagination: result.pagination,
        };
      },
    };

    const rescheduleReminderTool: AgentTool = {
      name: 'reschedule_reminder',
      description:
        'Change the scheduled date and time for one existing reminder. This also reopens a reminder that was already sent.',
      parameters: {
        type: 'object',
        properties: {
          reminderId: {
            type: 'string',
            description: 'Exact reminder ID returned by list_reminders.',
          },
          reminderAt: {
            type: 'string',
            description: `New future date/time. ISO-8601 with timezone offset (e.g. 2026-10-24T14:00:00${zoneOffset}) or local datetime (e.g. 2026-10-24T14:00:00). Stated times are interpreted in the user timezone (${zone}).`,
          },
        },
        required: ['reminderId', 'reminderAt'],
      },
      execute: async (args: Record<string, any>) => {
        const reminderId = String(args.reminderId || '').trim();
        const rawReminderAt = String(args.reminderAt || '').trim();
        const reminderAtIso = normalizeReminderAtToUtc(rawReminderAt, zone);
        const timestamp = Date.parse(reminderAtIso);
        if (!reminderId || !reminderAtIso || !Number.isFinite(timestamp)) {
          return {
            error: 'A valid reminderId and future reminderAt date/time are required.',
          };
        }
        if (timestamp <= Date.now()) {
          return {
            error: 'The new reminder time must be in the future.',
          };
        }

        const reminderLookup = await this.resolveWorkspaceReminder(userId, workspaceSlug, reminderId);
        if ('error' in reminderLookup) {
          return { error: reminderLookup.error };
        }
        const note = reminderLookup.note;

        const updated = await this.contentRepository.updateNote(userId, {
          ...note,
          reminderAt: reminderAtIso,
          status: KnowledgeStatus.Pending,
        });

        this.logger.info('ingest_agent.tool.reschedule_reminder', {
          userId,
          reminderId,
          reminderAt: reminderAtIso,
        });

        return {
          ok: true,
          id: updated.id,
          title: updated.title,
          status: updated.status,
          reminderAt: updated.reminderAt,
          formattedReminderAt: updated.reminderAt
            ? formatDateTimeInTimeZone(new Date(updated.reminderAt), zone)
            : '',
        };
      },
    };

    const updateReminderStatusTool: AgentTool = {
      name: 'update_reminder_status',
      description:
        'Update the status of an existing reminder (e.g. mark it as resolved/completed, archived, or reopen as pending). Call this when the user completes, finishes, archives, or resolves a reminder. Call list_reminders first to obtain the exact reminder ID.',
      parameters: {
        type: 'object',
        properties: {
          reminderId: {
            type: 'string',
            description: 'Exact reminder ID returned by list_reminders.',
          },
          status: {
            type: 'string',
            enum: ['resolved', 'archived', 'pending'],
            description: 'New reminder status: resolved (completed/done), archived (dismissed/deleted), or pending (reopened).',
          },
        },
        required: ['reminderId', 'status'],
      },
      execute: async (args: Record<string, any>) => {
        const reminderId = String(args.reminderId || '').trim();
        const status = String(args.status || '').trim().toLowerCase();
        if (!reminderId || !['resolved', 'archived', 'pending'].includes(status)) {
          return { error: "A valid reminderId and status ('resolved', 'archived', or 'pending') are required." };
        }

        const reminderLookup = await this.resolveWorkspaceReminder(userId, workspaceSlug, reminderId);
        if ('error' in reminderLookup) {
          return { error: reminderLookup.error };
        }

        const updated = await this.contentRepository.updateReminderStatus(userId, reminderId, status);
        if (!updated) {
          return { error: 'Failed to update reminder status.' };
        }

        this.logger.info('ingest_agent.tool.update_reminder_status', {
          userId,
          reminderId,
          status,
        });

        return {
          ok: true,
          id: updated.id,
          title: updated.title,
          status: updated.status,
          reminderAt: updated.reminderAt,
        };
      },
    };

    return [
      listProjectsTool,
      listProjectFoldersTool,
      createProjectFolderTool,
      listRemindersTool,
      rescheduleReminderTool,
      updateReminderStatusTool,
    ];
  }

  private async resolveWorkspaceReminder(userId: string, workspaceSlug: string, reminderId: string) {
    const note = await this.contentRepository.getNoteById(userId, reminderId);
    if (!note || !note.reminderAt) {
      return { error: 'Reminder not found.' };
    }

    const scope = await this.scopeResolver.resolveContentScopeFromSlugs(userId, { workspaceSlug });
    if (!scope.workspace || note.workspaceId !== scope.workspace.id) {
      return { error: 'Reminder not found in the connected workspace.' };
    }

    return { note };
  }

  private parseOptionalDate(value: unknown, timeZone = 'UTC'): string | undefined | null {
    if (value == null || String(value).trim() === '') {
      return undefined;
    }

    const iso = normalizeReminderAtToUtc(value, timeZone);
    return iso || null;
  }

  private clampInteger(value: unknown, fallback: number, min: number, max: number): number {
    const parsed = Number(value);

    return Number.isFinite(parsed) ? Math.min(max, Math.max(min, Math.floor(parsed))) : fallback;
  }
}
