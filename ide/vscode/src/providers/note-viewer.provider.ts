import * as vscode from 'vscode';
import { KbClient } from '../kb-client';

export class KoteNoteContentProvider implements vscode.TextDocumentContentProvider {
  private _onDidChange = new vscode.EventEmitter<vscode.Uri>();
  readonly onDidChange = this._onDidChange.event;

  constructor(private readonly kbClient: KbClient) {}

  async provideTextDocumentContent(uri: vscode.Uri): Promise<string> {
    let noteId: string | undefined;

    if (uri.authority === 'note') {
      const matches = uri.path.match(/^\/(.+)\.md$/);
      if (matches && matches[1]) {
        noteId = matches[1];
      }
    } else {
      const matches = uri.path.match(/\/note\/(.+)\.md$/);
      if (matches && matches[1]) {
        noteId = matches[1];
      }
    }

    if (!noteId) {
      return '# Error\nInvalid note URI.';
    }

    // Always fetch from backend - no cache needed for notes
    try {
      const note = await this.kbClient.getNote(noteId);
      if (!note) {
        return '# Error\nNote not found.';
      }

      return this.formatNoteAsMarkdown(note);
    } catch (error) {
      return `# Error\nFailed to load note: ${error instanceof Error ? error.message : String(error)}`;
    }
  }

  private formatNoteAsMarkdown(note: any): string {
    return `# ${note.title || 'Untitled'}

${note.content || ''}

---
*Created: ${note.occurredAt || note.date || new Date().toISOString()}*`;
  }
}
