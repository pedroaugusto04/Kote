import * as vscode from 'vscode';
import { KbClient } from '../kb-client';

export class KoteNoteContentProvider implements vscode.TextDocumentContentProvider {
  private _onDidChange = new vscode.EventEmitter<vscode.Uri>();
  readonly onDidChange = this._onDidChange.event;
  private loadingNotes = new Set<string>();

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

    // If already loading, return loading indicator
    if (this.loadingNotes.has(noteId)) {
      return `# Loading note...

⏳ Fetching note content from backend...

Please wait a moment...`;
    }

    // Start loading
    this.loadingNotes.add(noteId);
    this._onDidChange.fire(uri);

    try {
      const note = await this.kbClient.getNote(noteId);
      if (!note) {
        this.loadingNotes.delete(noteId);
        return '# Error\nNote not found.';
      }

      this.loadingNotes.delete(noteId);
      return this.formatNoteAsMarkdown(note);
    } catch (error) {
      this.loadingNotes.delete(noteId);
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
