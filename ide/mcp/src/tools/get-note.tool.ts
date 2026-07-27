import { ApiClient } from '../client/api-client.js';
import { McpTool } from './base.tool.js';
import { McpToolNames } from '../constants/mcp.constants.js';
import type { GetNoteArgs } from '../types/mcp.types.js';

export class GetNoteTool implements McpTool {
  readonly name = McpToolNames.GetNote;
  readonly description = 'Get the full details and Markdown content of a specific Kote note by its unique ID. Only call this tool after finding a candidate note ID via "kote_search_notes".';

  readonly inputSchema = {
    type: 'object' as const,
    properties: {
      id: {
        type: 'string',
        description: 'The unique note ID retrieved from search results'
      }
    },
    required: ['id']
  };

  async execute(args: GetNoteArgs, apiClient: ApiClient): Promise<unknown> {
    const note = await apiClient.getNoteDetail(args.id);
    
    return {
      id: note.id,
      title: note.title,
      project: note.projectSlug || 'inbox',
      path: note.path,
      occurredAt: note.occurredAt || note.createdAt,
      content: note.markdown,
      summary: note.summary
    };
  }
}
