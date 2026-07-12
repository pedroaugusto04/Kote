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

⏳ Fetching note content...

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
    const createdDate = note.occurredAt || note.date || note.createdAt || new Date().toISOString();
    let content = note.content || note.rawText || note.summary || 'No content available';
    const webBase = this.kbClient.apiUrl.replace(/\/api$/, '');
    const noteWebUrl = `${webBase}/vault/${note.id}`;
    
    // Add line breaks for long paragraphs to improve readability
    // Only wrap if content doesn't already have markdown structure
    if (!content.includes('\n\n') && content.length > 150) {
      content = this.wrapText(content, 100);
    }
    
    return `# ${note.title || 'Untitled'}

> [!NOTE]
> **Source Channel:** \`${note.sourceChannel || 'kote'}\` | **Project:** \`${note.projectSlug || 'Inbox'}\` | **Created at:** \`${new Date(createdDate).toLocaleString()}\`
>
> 🌐 **[View on Kote Web](${noteWebUrl})**

---

${content}`;
  }

  private wrapText(text: string, maxLineLength: number): string {
    // Split at sentence boundaries for better paragraph structure
    const sentences = text.split(/(?<=[.!?])\s+/);
    const paragraphs: string[] = [];
    
    for (const sentence of sentences) {
      if (sentence.length <= maxLineLength) {
        paragraphs.push(sentence);
      } else {
        // If sentence is still too long, wrap at word boundaries
        const words = sentence.split(' ');
        const lines: string[] = [];
        let currentLine = '';
        
        for (const word of words) {
          const testLine = currentLine ? `${currentLine} ${word}` : word;
          if (testLine.length <= maxLineLength) {
            currentLine = testLine;
          } else {
            if (currentLine) lines.push(currentLine);
            currentLine = word;
          }
        }
        if (currentLine) lines.push(currentLine);
        paragraphs.push(lines.join('\n'));
      }
    }
    
    // Join sentences with paragraph breaks (double newline)
    return paragraphs.join('\n\n');
  }
}
