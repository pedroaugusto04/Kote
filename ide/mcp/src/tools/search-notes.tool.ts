import { ApiClient } from '../client/api-client.js';
import { McpTool } from './base.tool.js';
import { McpToolNames } from '../constants/mcp.constants.js';
import type { SearchNotesArgs } from '../types/mcp.types.js';

export class SearchNotesTool implements McpTool {
  readonly name = McpToolNames.SearchNotes;
  readonly description = 'Search notes and context in Kote memory database. ONLY call this tool if the user explicitly asks about historical design decisions, project onboarding, or reasoning not visible in the current code. DO NOT use this tool for syntax questions, local file searches, or standard library APIs.';
  
  readonly inputSchema = {
    type: 'object' as const,
    properties: {
      query: {
        type: 'string',
        description: 'The search query or keywords to find relevant notes'
      },
      projectSlug: {
        type: 'string',
        description: 'Optional project slug to restrict the search scope'
      }
    },
    required: ['query']
  };

  async execute(args: SearchNotesArgs, apiClient: ApiClient): Promise<unknown> {
    const response = await apiClient.searchNotes(args.query, args.projectSlug);
    
    if (!response.ok || !response.matches || response.matches.length === 0) {
      return {
        message: `No notes found matching: "${args.query}"`
      };
    }

    // Format matches compactly to optimize tokens
    const formattedMatches = response.matches.map(note => ({
      id: note.id,
      title: note.title,
      path: note.path,
      project: note.projectSlug || note.project || 'inbox',
      snippet: note.snippet.substring(0, 150) + (note.snippet.length > 150 ? '...' : '')
    }));

    return {
      query: args.query,
      results: formattedMatches,
      instructions: 'To view the complete details of any note, use the "kote_get_note" tool with the note\'s "id".'
    };
  }
}
