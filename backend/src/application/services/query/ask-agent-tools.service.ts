import { Injectable, Optional } from '@nestjs/common';

import { ContentRepository, ContentQueryRepository } from '../../ports/notes/content.repository.js';
import type { EmbeddingConfig } from '../../ports/notes/embedding.gateway.js';
import { RagRetrievalService, type RagConfig, type RagScope } from './rag-retrieval.service.js';
import { RagContextAssemblerService } from './rag-context-assembler.service.js';
import { AppLogger } from '../../../observability/logger.js';
import type { AskAgentTool, TrackedNoteSource } from '../../ports/query/ask-agent.gateway.js';

import { AgentContextTracker } from './agent-context-tracker.js';

export { AgentContextTracker };

@Injectable()
export class AskAgentToolsService {
  constructor(
    private readonly ragRetrievalService: RagRetrievalService,
    private readonly ragContextAssemblerService: RagContextAssemblerService,
    private readonly contentRepository: ContentRepository,
    private readonly logger: AppLogger,
    @Optional() private readonly contentQueryRepository?: ContentQueryRepository,
  ) {}

  buildTools(
    userId: string,
    scope: RagScope,
    embeddingConfig: EmbeddingConfig,
    ragConfig: RagConfig,
    tracker: AgentContextTracker,
  ): AskAgentTool[] {
    const searchKnowledgeTool: AskAgentTool = {
      name: 'search_knowledge',
      description:
        "Search the user's notes and knowledge base using semantic vector search and keyword search. Returns relevant text excerpts, titles, and note paths.",
      parameters: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: 'The search query or keywords to find relevant information in notes.',
          },
        },
        required: ['query'],
      },
      execute: async (args: Record<string, any>) => {
        const query = String(args.query || '').trim();
        if (!query) {
          return { error: 'Query parameter cannot be empty' };
        }

        this.logger.info('ask_agent.tool.search_knowledge', { userId, query, scope });
        const retrieval = await this.ragRetrievalService.retrieveHybridChunks(
          userId,
          query,
          scope,
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
            workspaceSlug: chunk.workspaceId,
          });
        }

        return {
          resultsCount: contextResult.contextChunks.length,
          chunks: contextResult.contextChunks.map((c) => ({
            noteId: c.noteId,
            title: c.title,
            path: c.path,
            project: c.projectSlug,
            text: c.chunkText,
          })),
        };
      },
    };

    const getNoteContentTool: AskAgentTool = {
      name: 'get_note_content',
      description:
        'Retrieve the complete markdown body and details of a specific note by its noteId. Use when a chunk excerpt does not contain enough context.',
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

        this.logger.info('ask_agent.tool.get_note_content', { userId, noteId });
        const notes = await this.contentRepository.getNotesByIds(userId, [noteId]);
        if (!notes || notes.length === 0) {
          return { error: `Note not found with id: ${noteId}` };
        }

        const note = notes[0];
        tracker.addSource({
          noteId: note.id,
          title: note.title,
          path: note.path,
          projectSlug: note.projectSlug,
          workspaceSlug: note.workspaceSlug,
        });

        return {
          id: note.id,
          title: note.title,
          path: note.path,
          projectSlug: note.projectSlug,
          tags: note.tags,
          content: note.markdown || '',
        };
      },
    };

    const listProjectsTool: AskAgentTool = {
      name: 'list_projects',
      description: "List all projects in the user's workspace with their names, slugs, and descriptions.",
      parameters: {
        type: 'object',
        properties: {},
      },
      execute: async () => {
        this.logger.info('ask_agent.tool.list_projects', { userId });
        const projects = await this.contentRepository.listProjects(userId);
        return {
          projects: projects.map((p) => ({
            id: p.id,
            name: p.displayName,
            slug: p.projectSlug,
            defaultTags: p.defaultTags || [],
          })),
        };
      },
    };

    const listRecentNotesTool: AskAgentTool = {
      name: 'list_recent_notes',
      description: 'List the most recent notes created or modified in the current workspace or project.',
      parameters: {
        type: 'object',
        properties: {
          limit: {
            type: 'string',
            description: 'Maximum number of notes to return (default 5, max 15).',
          },
        },
      },
      execute: async (args: Record<string, any>) => {
        const limit = Math.min(Math.max(parseInt(String(args.limit || '5'), 10) || 5, 1), 15);
        this.logger.info('ask_agent.tool.list_recent_notes', { userId, limit, scope });
        const notes = await this.contentRepository.listNotes(userId, {
          workspaceId: scope.workspaceId,
          projectId: scope.projectId,
        });

        const recent = notes.slice(0, limit);
        for (const n of recent) {
          tracker.addRelatedNote({
            id: n.id,
            title: n.title,
            path: n.path,
            projectSlug: n.projectSlug,
            workspaceSlug: n.workspaceSlug,
          });
        }

        return {
          notes: recent.map((n) => ({
            id: n.id,
            title: n.title,
            path: n.path,
            projectSlug: n.projectSlug,
            occurredAt: n.occurredAt,
          })),
        };
      },
    };

    const listRemindersTool: AskAgentTool = {
      name: 'list_reminders',
      description:
        'List user reminders, scheduled tasks, and due dates. Useful for answering questions about upcoming deadlines, pending reminders, or overdue tasks.',
      parameters: {
        type: 'object',
        properties: {
          status: {
            type: 'string',
            description: "Optional status filter: 'pending', 'sent', 'overdue', or leave empty to list all.",
          },
        },
      },
      execute: async (args: Record<string, any>) => {
        this.logger.info('ask_agent.tool.list_reminders', { userId, args });
        if (!this.contentQueryRepository) {
          return { reminders: [] };
        }
        const reminders = await this.contentQueryRepository.listReminders(userId);
        const filterStatus = String(args.status || '').toLowerCase().trim();
        const filtered = filterStatus
          ? reminders.filter((r) => {
              if (filterStatus === 'overdue') return r.isOverdue;
              return r.status.toLowerCase() === filterStatus;
            })
          : reminders;

        return {
          count: filtered.length,
          reminders: filtered.slice(0, 15).map((r) => ({
            id: r.id,
            title: r.title,
            project: r.project,
            status: r.status,
            isOverdue: r.isOverdue,
            reminderAt: r.reminderAt,
            noteText: r.noteText,
          })),
        };
      },
    };

    const listNoteAttachmentsTool: AskAgentTool = {
      name: 'list_note_attachments',
      description: 'List all attachments, files, or documents uploaded to a specific note.',
      parameters: {
        type: 'object',
        properties: {
          noteId: {
            type: 'string',
            description: 'The UUID of the note to list attachments for.',
          },
        },
        required: ['noteId'],
      },
      execute: async (args: Record<string, any>) => {
        const noteId = String(args.noteId || '').trim();
        if (!noteId) return { error: 'noteId parameter is required' };
        this.logger.info('ask_agent.tool.list_note_attachments', { userId, noteId });
        const attachments = await this.contentRepository.listAttachments(userId, noteId);
        return {
          noteId,
          attachmentsCount: attachments.length,
          attachments: attachments.map((a) => ({
            id: a.id,
            fileName: a.fileName,
            sizeBytes: a.sizeBytes,
            mimeType: a.mimeType,
            createdAt: a.createdAt,
          })),
        };
      },
    };

    return [
      searchKnowledgeTool,
      getNoteContentTool,
      listProjectsTool,
      listRecentNotesTool,
      listRemindersTool,
      listNoteAttachmentsTool,
    ];
  }
}
