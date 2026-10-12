import { Injectable } from '@nestjs/common';

import { ContentRepository } from '../../ports/notes/content.repository.js';
import { AppLogger } from '../../../observability/logger.js';
import type { AgentTool } from '../../../contracts/agent-tool.js';
import { resolveContentScopeFromSlugs } from '../../utils/content/content-scope.utils.js';
import { buildProjectFolderTree } from '../../utils/content/project-folder.utils.js';
import { serializeFolderTreeNode } from '../../use-cases/conversation/services/conversation-agent-state-machine.js';

@Injectable()
export class IngestAgentToolsService {
  constructor(
    private readonly contentRepository: ContentRepository,
    private readonly logger: AppLogger,
  ) {}

  buildTools(userId: string, workspaceSlug: string): AgentTool[] {
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

        const scope = await resolveContentScopeFromSlugs(this.contentRepository, userId, {
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

    const searchNotesTool: AgentTool = {
      name: 'search_notes',
      description: 'Search recent notes by keyword or in a specific project to check existing content.',
      parameters: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: 'Search term or keywords.',
          },
          projectSlug: {
            type: 'string',
            description: 'Optional project slug to restrict search.',
          },
        },
      },
      execute: async (args: Record<string, any>) => {
        const query = String(args.query || '').trim().toLowerCase();
        const projectSlug = args.projectSlug ? String(args.projectSlug).trim().toLowerCase() : undefined;

        this.logger.info('ingest_agent.tool.search_notes', { userId, query, projectSlug });
        const notes = await this.contentRepository.listNotes(userId, {
          projectId: projectSlug,
        });

        const matching = query
          ? notes.filter(
              (n) =>
                n.title.toLowerCase().includes(query) ||
                (n.path && n.path.toLowerCase().includes(query)),
            ).slice(0, 5)
          : notes.slice(0, 5);

        return {
          count: matching.length,
          notes: matching.map((n) => ({
            id: n.id,
            title: n.title,
            path: n.path,
            projectSlug: n.projectSlug,
          })),
        };
      },
    };

    return [listProjectsTool, listProjectFoldersTool, searchNotesTool];
  }
}
