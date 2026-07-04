import { ApiClient } from '../client/api-client.js';
import { McpTool } from './base.tool.js';
import { McpToolNames } from '../constants/mcp.constants.js';
import type { CreateNoteArgs } from '../types/mcp.types.js';

export class CreateNoteTool implements McpTool {
  readonly name = McpToolNames.CreateNote;
  readonly description = 'Save a new note, development decision, or context summary to Kote memory. Call this tool when you finish an important refactoring, resolve a complex bug, or agree with the user on an architectural choice, ensuring the decision is stored for future sessions.';

  readonly inputSchema = {
    type: 'object' as const,
    properties: {
      title: {
        type: 'string',
        description: 'Descriptive title for the note/decision'
      },
      markdown: {
        type: 'string',
        description: 'Complete contents of the note in Markdown format'
      },
      projectSlug: {
        type: 'string',
        description: 'Optional project slug. Defaults to user configuration default project.'
      }
    },
    required: ['title', 'markdown']
  };

  async execute(args: CreateNoteArgs, apiClient: ApiClient): Promise<unknown> {
    const response = await apiClient.createNote(args.title, args.markdown, args.projectSlug);
    
    if (response.id || response.noteId) {
      return {
        ok: true,
        message: 'Note created successfully',
        noteId: response.id || response.noteId
      };
    }

    return {
      ok: false,
      message: 'Failed to create note. Verify server connection or permissions.'
    };
  }
}
