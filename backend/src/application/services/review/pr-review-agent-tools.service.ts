import { Injectable } from '@nestjs/common';

import type { AgentTool } from '../../../contracts/agent-tool.js';
import { ContentRepository } from '../../ports/notes/content.repository.js';
import type { EmbeddingConfig } from '../../ports/notes/embedding.gateway.js';
import { RagRetrievalService, type RagConfig, type RagScope } from '../query/rag-retrieval.service.js';
import { RagContextAssemblerService } from '../query/rag-context-assembler.service.js';
import { GithubIntegrationGateway } from '../../ports/integrations/github-integration.port.js';
import { AppLogger } from '../../../observability/logger.js';
import { type AgentContextTracker } from '../query/agent-context-tracker.js';
import { toAskChunkItems } from '../../mappers/ask.mapper.js';

const MAX_READ_FILE_CHARS = 25_000;

@Injectable()
export class PrReviewAgentToolsService {
  constructor(
    private readonly ragRetrievalService: RagRetrievalService,
    private readonly ragContextAssemblerService: RagContextAssemblerService,
    private readonly contentRepository: ContentRepository,
    private readonly githubIntegrationGateway: GithubIntegrationGateway,
    private readonly logger: AppLogger,
  ) {}

  buildTools(params: {
    userId: string;
    scope: RagScope;
    embeddingConfig: EmbeddingConfig;
    ragConfig: RagConfig;
    githubToken: string;
    repoFullName: string;
    headSha: string;
    tracker: AgentContextTracker;
  }): AgentTool[] {
    const { userId, scope, embeddingConfig, ragConfig, githubToken, repoFullName, headSha, tracker } = params;

    const searchKnowledgeTool: AgentTool = {
      name: 'search_knowledge',
      description:
        "Search the user's notes, architectural decisions, and knowledge base using semantic vector search and keyword search. Formulate search queries based on the code concepts, components, or domain rules seen in the PR.",
      parameters: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: 'The search query or keywords to find relevant rules, design records, or guidelines.',
          },
          projectSlug: {
            type: 'string',
            description: 'Optional project slug to restrict the search to a specific project.',
          },
        },
        required: ['query'],
      },
      execute: async (args: Record<string, any>) => {
        const query = String(args.query || '').trim();
        if (!query) {
          return { error: 'Query parameter cannot be empty' };
        }

        let effectiveScope: RagScope = { ...scope };
        const requestedProjectSlug = String(args.projectSlug || '').trim().toLowerCase();
        if (requestedProjectSlug) {
          const allProjects = await this.contentRepository.listProjects(userId);
          const matched = allProjects.find(
            (p) => p.projectSlug.toLowerCase() === requestedProjectSlug && (!scope.workspaceId || p.workspaceId === scope.workspaceId),
          );
          if (matched) {
            effectiveScope = { ...effectiveScope, projectId: matched.id };
          }
        }

        this.logger.info('pr_review_agent.tool.search_knowledge', { userId, query, scope: effectiveScope, repoFullName });
        const retrieval = await this.ragRetrievalService.retrieveHybridChunks(
          userId,
          query,
          effectiveScope,
          embeddingConfig,
          ragConfig,
        );

        if (retrieval.rankedChunks.length === 0) {
          return { message: 'No relevant notes found for query.', query };
        }

        const contextResult = await this.ragContextAssemblerService.buildAskContextResult(
          userId,
          retrieval.rankedChunks,
          retrieval.noteMap,
          retrieval.validSyntheses,
        );

        for (const item of contextResult.relatedNotes) {
          tracker.addRelatedNote(item);
        }

        for (const chunk of contextResult.contextChunks) {
          tracker.addSource({
            noteId: chunk.noteId,
            title: chunk.title,
            path: chunk.path,
            projectSlug: chunk.projectSlug,
            workspaceId: chunk.workspaceId,
          });
        }

        return {
          resultsCount: contextResult.contextChunks.length,
          chunks: toAskChunkItems(contextResult.contextChunks),
        };
      },
    };

    const getNoteContentTool: AgentTool = {
      name: 'get_note_content',
      description:
        'Retrieve the complete markdown body and details of a specific note by its noteId when the excerpt chunk is not detailed enough.',
      parameters: {
        type: 'object',
        properties: {
          noteId: {
            type: 'string',
            description: 'The UUID of the note to retrieve.',
          },
        },
        required: ['noteId'],
      },
      execute: async (args: Record<string, any>) => {
        const noteId = String(args.noteId || '').trim();
        if (!noteId) {
          return { error: 'noteId parameter is required' };
        }

        this.logger.info('pr_review_agent.tool.get_note_content', { userId, noteId, repoFullName });
        const notes = await this.contentRepository.getNotesByIds(userId, [noteId]);
        if (!notes || notes.length === 0) {
          return { error: `Note not found with id: ${noteId}` };
        }

        const note = notes[0];
        if (
          (scope.workspaceId && note.workspaceId !== scope.workspaceId) ||
          (scope.projectId && note.projectId !== scope.projectId)
        ) {
          return { error: `Note not found with id: ${noteId}` };
        }

        tracker.addSource({
          noteId: note.id,
          title: note.title,
          path: note.path,
          projectSlug: note.projectSlug || undefined,
          workspaceId: note.workspaceId,
        });

        const rawContent = note.markdown || note.summary || '';
        const isTruncated = rawContent.length > MAX_READ_FILE_CHARS;
        const content = isTruncated
          ? `${rawContent.slice(0, MAX_READ_FILE_CHARS)}\n\n[Content truncated: note exceeds maximum length]`
          : rawContent;

        return {
          noteId: note.id,
          title: note.title,
          path: note.path,
          content,
        };
      },
    };

    const readRepositoryFileTool: AgentTool = {
      name: 'read_repository_file',
      description:
        'Read the content of any file from the GitHub repository at the PR head ref. Use this to inspect imported interfaces, types, schemas, callers, or context beyond the diff patch.',
      parameters: {
        type: 'object',
        properties: {
          path: {
            type: 'string',
            description: 'The repository relative file path (e.g. "src/auth/auth.service.ts").',
          },
        },
        required: ['path'],
      },
      execute: async (args: Record<string, any>) => {
        const filePath = String(args.path || '').trim();
        if (!filePath) {
          return { error: 'path parameter is required' };
        }

        this.logger.info('pr_review_agent.tool.read_repository_file', { repoFullName, filePath, headSha });

        try {
          const content = await this.githubIntegrationGateway.fetchFileContent(repoFullName, filePath, githubToken);
          if (content.length > MAX_READ_FILE_CHARS) {
            return {
              path: filePath,
              content: content.slice(0, MAX_READ_FILE_CHARS) + '\n\n... [Content truncated due to size limit]',
              isTruncated: true,
            };
          }
          return {
            path: filePath,
            content,
          };
        } catch (error) {
          this.logger.warn('pr_review_agent.tool.read_repository_file_failed', {
            repoFullName,
            filePath,
            error: error instanceof Error ? error.message : String(error),
          });
          return {
            error: `Failed to read file ${filePath}: ${error instanceof Error ? error.message : String(error)}`,
          };
        }
      },
    };

    return [searchKnowledgeTool, getNoteContentTool, readRepositoryFileTool];
  }
}
