import * as vscode from 'vscode';
import { KbClient } from '../kb-client';

export class FileNotesSummaryProvider {
  private static currentPanel: FileNotesSummaryProvider | undefined;
  private readonly panel: vscode.WebviewPanel;
  private readonly disposables: vscode.Disposable[] = [];
  private static outputChannel: vscode.OutputChannel;
  private static noteContentProvider: any;

  private constructor(
    panel: vscode.WebviewPanel,
    private readonly kbClient: KbClient,
    private readonly filePath: string,
    private readonly notes: any[],
  ) {
    this.panel = panel;

    if (!FileNotesSummaryProvider.outputChannel) {
      FileNotesSummaryProvider.outputChannel = vscode.window.createOutputChannel('Kote File Notes Summary');
    }

    this.panel.onDidDispose(() => this.dispose(), null, this.disposables);

    this.panel.webview.onDidReceiveMessage(
      async (message) => {
        switch (message.command) {
          case 'openNote':
            await this.openNote(message.noteId);
            return;
          case 'refresh':
            await this.refresh();
            return;
          case 'copyContent':
            await this.copyContent(message.content);
            return;
        }
      },
      null,
      this.disposables,
    );

    this.loadContent();
  }

  public static async show(
    extensionUri: vscode.Uri,
    kbClient: KbClient,
    filePath: string,
    notes: any[],
    noteContentProvider?: any,
  ) {
    const column = vscode.window.activeTextEditor
      ? vscode.window.activeTextEditor.viewColumn
      : undefined;

    // Always set noteContentProvider, even if panel exists
    if (noteContentProvider) {
      FileNotesSummaryProvider.noteContentProvider = noteContentProvider;
    }

    if (FileNotesSummaryProvider.currentPanel) {
      FileNotesSummaryProvider.currentPanel.panel.reveal(column);
      return;
    }

    const panel = vscode.window.createWebviewPanel(
      'kote.fileNotesSummary',
      `Kote: File Notes Summary - ${filePath}`,
      column || vscode.ViewColumn.One,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [
          vscode.Uri.joinPath(extensionUri, 'media'),
        ],
      },
    );

    FileNotesSummaryProvider.currentPanel = new FileNotesSummaryProvider(
      panel,
      kbClient,
      filePath,
      notes,
    );
  }

  private async loadContent() {
    FileNotesSummaryProvider.outputChannel.appendLine(`Loading summary for file: ${this.filePath}`);
    FileNotesSummaryProvider.outputChannel.appendLine(`Notes count: ${this.notes.length}`);

    try {
      // Show notes first while loading summary
      this.panel.webview.html = this.getHtmlWithLoadingNotes(this.notes);
      FileNotesSummaryProvider.outputChannel.appendLine('Loading HTML rendered successfully');
    } catch (htmlError) {
      FileNotesSummaryProvider.outputChannel.appendLine(`Error rendering loading HTML: ${htmlError instanceof Error ? htmlError.message : String(htmlError)}`);
      // Fallback to simple loading HTML
      this.panel.webview.html = this.getLoadingHtml();
    }

    try {
      const summary = await Promise.race([
        this.kbClient.getFileNotesSummary(this.filePath),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Request timeout after 30 seconds')), 30000)
        )
      ]) as any;

      FileNotesSummaryProvider.outputChannel.appendLine('Summary loaded successfully');
      this.panel.webview.html = this.getHtml(summary, this.notes);
    } catch (error) {
      FileNotesSummaryProvider.outputChannel.appendLine(`Error loading summary: ${error instanceof Error ? error.message : String(error)}`);
      FileNotesSummaryProvider.outputChannel.show();
      
      this.panel.webview.html = this.getErrorHtml(
        error instanceof Error ? error.message : String(error),
      );
    }
  }

  private async refresh() {
    await this.loadContent();
  }

  private async openNote(noteId: string) {
    try {
      FileNotesSummaryProvider.outputChannel.appendLine(`Opening note: ${noteId}`);
      FileNotesSummaryProvider.outputChannel.appendLine(`noteContentProvider available: ${!!FileNotesSummaryProvider.noteContentProvider}`);
      
      // Fetch full note content from API
      const note = await this.kbClient.getNote(noteId);
      if (!note) {
        FileNotesSummaryProvider.outputChannel.appendLine('Note not found from API');
        vscode.window.showErrorMessage('Note not found');
        return;
      }

      FileNotesSummaryProvider.outputChannel.appendLine(`Note fetched: ${note.id}, title: ${note.title}`);

      // Set note content in provider before opening
      if (FileNotesSummaryProvider.noteContentProvider) {
        const markdown = this.formatNoteAsMarkdown(note);
        FileNotesSummaryProvider.outputChannel.appendLine(`Setting note content, markdown length: ${markdown.length}`);
        FileNotesSummaryProvider.noteContentProvider.setNoteContent(note.id, markdown);
        FileNotesSummaryProvider.outputChannel.appendLine(`Note content set for ${note.id}`);
      } else {
        FileNotesSummaryProvider.outputChannel.appendLine('Warning: noteContentProvider not available');
      }

      const uri = vscode.Uri.parse(`kote-note://note/${note.id}.md`);
      FileNotesSummaryProvider.outputChannel.appendLine(`Opening URI: ${uri.toString()}`);
      await vscode.commands.executeCommand('vscode.openWith', uri, 'kote-note.preview');
      FileNotesSummaryProvider.outputChannel.appendLine('Document opened');
    } catch (error) {
      FileNotesSummaryProvider.outputChannel.appendLine(`Error opening note: ${error instanceof Error ? error.message : String(error)}`);
      FileNotesSummaryProvider.outputChannel.show();
      vscode.window.showErrorMessage('Failed to open note');
    }
  }

  private formatNoteAsMarkdown(note: any): string {
    return `# ${note.title || 'Untitled'}

${note.content || ''}

---
*Created: ${note.occurredAt || note.date || new Date().toISOString()}*`;
  }

  private async copyContent(content: string) {
    await vscode.env.clipboard.writeText(content);
    vscode.window.showInformationMessage('Summary copied to clipboard');
  }

  private getLoadingHtml(): string {
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline';">
  <style>
    body {
      font-family: var(--vscode-font-family);
      font-size: var(--vscode-font-size);
      color: var(--vscode-foreground);
      background-color: var(--vscode-editor-background);
      padding: 20px;
      display: flex;
      justify-content: center;
      align-items: center;
      min-height: 100vh;
      margin: 0;
    }
    .loading {
      text-align: center;
    }
    .spinner {
      border: 3px solid var(--vscode-progressBar-background);
      border-top: 3px solid var(--vscode-progressBar-foreground);
      border-radius: 50%;
      width: 40px;
      height: 40px;
      animation: spin 1s linear infinite;
      margin: 0 auto 20px;
    }
    @keyframes spin {
      0% { transform: rotate(0deg); }
      100% { transform: rotate(360deg); }
    }
  </style>
</head>
<body>
  <div class="loading">
    <div class="spinner"></div>
    <p>Generating AI summary...</p>
  </div>
</body>
</html>`;
  }

  private getErrorHtml(error: string): string {
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline';">
  <style>
    body {
      font-family: var(--vscode-font-family);
      font-size: var(--vscode-font-size);
      color: var(--vscode-foreground);
      background-color: var(--vscode-editor-background);
      padding: 20px;
      margin: 0;
    }
    .error {
      background-color: var(--vscode-errorBackground);
      color: var(--vscode-errorForeground);
      padding: 15px;
      border-radius: 4px;
      margin-bottom: 20px;
    }
    .retry-btn {
      background-color: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
      border: none;
      padding: 8px 16px;
      cursor: pointer;
      font-size: var(--vscode-font-size);
    }
    .retry-btn:hover {
      background-color: var(--vscode-button-hoverBackground);
    }
  </style>
</head>
<body>
  <div class="error">
    <h3>Error loading summary</h3>
    <p>${this.escapeHtml(error)}</p>
  </div>
  <button class="retry-btn" onclick="window.location.reload()">Retry</button>
</body>
</html>`;
  }

  private getHtmlWithLoadingNotes(notes: any[]): string {
    try {
      const notesJson = JSON.stringify(notes);
      const safeNotes = notes || [];
      
      const notesHtml = safeNotes.map(note => {
        const noteId = note?.id || '';
        const title = note?.title || 'Untitled';
        const summary = note?.summary || 'No summary';
        const date = note?.date || note?.occurredAt || new Date().toISOString();
        return `
          <div class="note-item" onclick="openNote('${this.escapeHtml(String(noteId))}')">
            <div class="note-title">${this.escapeHtml(title)}</div>
            <div class="note-summary">${this.escapeHtml(summary)}</div>
            <div class="note-date" data-date="${date}">${date}</div>
          </div>
        `;
      }).join('');

      return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline';">
  <style>
    body {
      font-family: var(--vscode-font-family);
      font-size: var(--vscode-font-size);
      color: var(--vscode-foreground);
      background-color: var(--vscode-editor-background);
      padding: 20px;
      margin: 0;
    }
    h1 { margin: 0 0 16px 0; }
    h3 { margin: 24px 0 12px 0; }
    p { margin: 8px 0; }
    .loading-section {
      background: var(--vscode-editor-background);
      border: 1px solid var(--vscode-panel-border);
      border-radius: 8px;
      padding: 20px;
      margin: 20px 0;
      text-align: center;
    }
    .spinner {
      border: 3px solid var(--vscode-progressBar-background);
      border-top: 3px solid var(--vscode-progressBar-foreground);
      border-radius: 50%;
      width: 30px;
      height: 30px;
      animation: spin 1s linear infinite;
      margin: 0 auto 12px;
    }
    @keyframes spin {
      0% { transform: rotate(0deg); }
      100% { transform: rotate(360deg); }
    }
    .notes-section { margin-top: 32px; }
    .note-item {
      padding: 12px;
      border: 1px solid var(--vscode-panel-border);
      border-radius: 6px;
      margin-bottom: 8px;
      cursor: pointer;
    }
    .note-item:hover { background: var(--vscode-editor-hoverBackground); }
    .note-title { font-weight: 600; margin-bottom: 4px; }
    .note-summary { font-size: 0.9em; color: var(--vscode-descriptionForeground); margin-bottom: 4px; }
    .note-date { font-size: 0.85em; color: var(--vscode-descriptionForeground); }
  </style>
</head>
<body>
  <h1>💡 File Notes Summary</h1>
  <p><strong>File:</strong> ${this.escapeHtml(this.filePath)}</p>

  <div class="loading-section">
    <div class="spinner"></div>
    <p>Generating AI summary...</p>
    <p style="font-size: 0.9em; color: var(--vscode-descriptionForeground);">Notes are available below while summary loads</p>
  </div>

  <div class="notes-section">
    <h3>📝 Notes (${safeNotes.length})</h3>
    ${notesHtml}
  </div>

  <script>
    const vscode = acquireVsCodeApi();
    const notes = ${notesJson};
    
    // Format dates in browser
    document.querySelectorAll('.note-date').forEach(el => {
      const dateStr = el.getAttribute('data-date');
      if (dateStr) {
        try {
          el.textContent = new Date(dateStr).toLocaleDateString();
        } catch (e) {
          el.textContent = dateStr;
        }
      }
    });
    
    function openNote(noteId) {
      vscode.postMessage({ command: 'openNote', noteId });
    }
  </script>
</body>
</html>`;
    } catch (error) {
      FileNotesSummaryProvider.outputChannel.appendLine(`Error in getHtmlWithLoadingNotes: ${error instanceof Error ? error.message : String(error)}`);
      throw error;
    }
  }

  private getHtml(
    summary: {
      summary: string;
      understanding: string;
      timeline: Array<{ date: string; title: string; description: string; noteId: string }>;
      keyChanges: Array<{ description: string; noteId: string }>;
      generatedAt: string;
    },
    notes: any[],
  ): string {
    const notesJson = JSON.stringify(notes);
    const summaryJson = JSON.stringify(summary);

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline';">
  <style>
    body {
      font-family: var(--vscode-font-family);
      font-size: var(--vscode-font-size);
      color: var(--vscode-foreground);
      background-color: var(--vscode-editor-background);
      padding: 20px;
      margin: 0;
      line-height: 1.6;
    }
    h1, h2, h3 {
      margin-top: 0;
      color: var(--vscode-foreground);
    }
    h1 {
      font-size: 1.5em;
      margin-bottom: 10px;
      border-bottom: 1px solid var(--vscode-panel-border);
      padding-bottom: 10px;
    }
    h2 {
      font-size: 1.3em;
      margin-top: 25px;
      margin-bottom: 15px;
    }
    h3 {
      font-size: 1.1em;
      margin-top: 20px;
      margin-bottom: 10px;
    }
    .summary {
      background-color: var(--vscode-textBlockQuote-background);
      border-left: 4px solid var(--vscode-textBlockQuote-border);
      padding: 15px;
      margin: 20px 0;
      font-style: italic;
    }
    .understanding {
      margin: 20px 0;
    }
    .timeline {
      margin: 20px 0;
    }
    .timeline-item {
      border-left: 2px solid var(--vscode-panel-border);
      padding-left: 20px;
      margin-bottom: 20px;
      position: relative;
    }
    .timeline-item::before {
      content: '';
      position: absolute;
      left: -6px;
      top: 5px;
      width: 10px;
      height: 10px;
      border-radius: 50%;
      background-color: var(--vscode-button-foreground);
    }
    .timeline-date {
      font-size: 0.9em;
      color: var(--vscode-descriptionForeground);
      margin-bottom: 5px;
    }
    .timeline-title {
      font-weight: bold;
      margin-bottom: 5px;
    }
    .timeline-description {
      color: var(--vscode-foreground);
    }
    .key-changes {
      margin: 20px 0;
    }
    .change-item {
      background-color: var(--vscode-editor-inactiveSelectionBackground);
      padding: 12px;
      margin-bottom: 10px;
      border-radius: 4px;
      cursor: pointer;
      transition: background-color 0.2s;
    }
    .change-item:hover {
      background-color: var(--vscode-editor-selectionBackground);
    }
    .change-description {
      margin-bottom: 5px;
    }
    .note-link {
      font-size: 0.85em;
      color: var(--vscode-textLink-foreground);
      text-decoration: none;
    }
    .note-link:hover {
      text-decoration: underline;
    }
    .notes-list {
      margin-top: 30px;
      border-top: 1px solid var(--vscode-panel-border);
      padding-top: 20px;
    }
    .notes-list h2 {
      margin-top: 0;
    }
    .note-item {
      padding: 10px;
      margin-bottom: 10px;
      background-color: var(--vscode-editor-inactiveSelectionBackground);
      border-radius: 4px;
      cursor: pointer;
      transition: background-color 0.2s;
    }
    .note-item:hover {
      background-color: var(--vscode-editor-selectionBackground);
    }
    .note-title {
      font-weight: bold;
      margin-bottom: 5px;
    }
    .note-summary {
      font-size: 0.9em;
      color: var(--vscode-descriptionForeground);
    }
    .copy-button {
      position: fixed;
      top: 20px;
      right: 20px;
      background-color: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
      border: none;
      padding: 8px 16px;
      cursor: pointer;
      font-size: var(--vscode-font-size);
      border-radius: 4px;
      z-index: 1000;
    }
    .copy-button:hover {
      background-color: var(--vscode-button-hoverBackground);
    }
  </style>
</head>
<body>
  <button class="copy-button" onclick="copySummary()">Copy Summary</button>
  
  <h1>💡 File Notes Summary</h1>
  <p><strong>File:</strong> ${this.escapeHtml(this.filePath)}</p>
  <p><strong>Generated:</strong> <span class="generated-date" data-date="${this.escapeHtml(summary.generatedAt)}">${this.escapeHtml(summary.generatedAt)}</span></p>
  
  <div class="summary">
    <h3>Summary</h3>
    <p>${this.escapeHtml(summary.summary)}</p>
  </div>

  <div class="understanding">
    <h3>Understanding</h3>
    <p>${this.escapeHtml(summary.understanding)}</p>
  </div>

  <div class="timeline">
    <h2>Timeline</h2>
    ${summary.timeline.map(item => `
      <div class="timeline-item">
        <div class="timeline-date">${this.escapeHtml(item.date)}</div>
        <div class="timeline-title">${this.escapeHtml(item.title)}</div>
        <div class="timeline-description">${this.escapeHtml(item.description)}</div>
      </div>
    `).join('')}
  </div>

  <div class="key-changes">
    <h2>Key Changes</h2>
    ${summary.keyChanges.map(change => `
      <div class="change-item" onclick="openNote('${change.noteId}')">
        <div class="change-description">${this.escapeHtml(change.description)}</div>
        <a href="#" class="note-link" onclick="event.preventDefault(); openNote('${change.noteId}')">View note →</a>
      </div>
    `).join('')}
  </div>

  <div class="notes-list">
    <h2>All Notes (${notes.length})</h2>
    ${notes.map(note => `
      <div class="note-item" onclick="openNote('${note.id}')">
        <div class="note-title">${this.escapeHtml(note.title || 'Untitled')}</div>
        <div class="note-summary">${this.escapeHtml(note.summary || 'No summary')}</div>
      </div>
    `).join('')}
  </div>

  <script>
    const vscode = acquireVsCodeApi();
    const notes = ${notesJson};
    const summary = ${summaryJson};

    // Format generated date
    const generatedDateEl = document.querySelector('.generated-date');
    if (generatedDateEl) {
      const dateStr = generatedDateEl.getAttribute('data-date');
      if (dateStr) {
        try {
          generatedDateEl.textContent = new Date(dateStr).toLocaleString();
        } catch (e) {
          generatedDateEl.textContent = dateStr;
        }
      }
    }

    function openNote(noteId) {
      vscode.postMessage({
        command: 'openNote',
        noteId: noteId
      });
    }

    function copySummary() {
      const markdown = \`# 💡 File Notes Summary

**File:** ${this.escapeHtml(this.filePath)}

## Summary
${this.escapeHtml(summary.summary)}

## Understanding
${this.escapeHtml(summary.understanding)}

## Timeline
\${summary.timeline.map(item => \`- **\${item.date}**: \${item.title}
  - \${item.description}\`).join('\\\\n')}

## Key Changes
\${summary.keyChanges.map(change => \`- \${change.description} (Note: \${change.noteId})\`).join('\\\\n')}

## All Notes (\${notes.length})
\${notes.map(note => \`- **\${note.title || 'Untitled'}**: \${note.summary || 'No summary'}\`).join('\\\\n')}
\`;
      vscode.postMessage({
        command: 'copyContent',
        content: markdown
      });
    }
  </script>
</body>
</html>`;
  }

  private escapeHtml(text: string): string {
    const map: Record<string, string> = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#039;',
    };
    return text.replace(/[&<>"']/g, (char) => map[char]);
  }

  public dispose() {
    FileNotesSummaryProvider.currentPanel = undefined;
    this.panel.dispose();
    while (this.disposables.length) {
      const disposable = this.disposables.pop();
      if (disposable) disposable.dispose();
    }
  }
}
