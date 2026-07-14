import * as vscode from 'vscode';
import { KbClient } from '../kb-client';
import { NoteDetailWebviewProvider } from './note-detail-webview.provider';

export class FileNotesSummaryProvider {
  private static currentPanel: FileNotesSummaryProvider | undefined;
  private readonly panel: vscode.WebviewPanel;
  private readonly disposables: vscode.Disposable[] = [];
  private static outputChannel: vscode.OutputChannel;
  private abortController: AbortController | undefined;
  private relatedNotes: any[] | undefined;

  private constructor(
    panel: vscode.WebviewPanel,
    private readonly kbClient: KbClient,
    private readonly filePath: string,
    private readonly notes: any[],
    private readonly extensionUri: vscode.Uri,
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
  ) {
    const column = vscode.window.activeTextEditor
      ? vscode.window.activeTextEditor.viewColumn
      : undefined;

    // Dispose existing panel if it's for a different file
    if (FileNotesSummaryProvider.currentPanel) {
      FileNotesSummaryProvider.currentPanel.panel.dispose();
      FileNotesSummaryProvider.currentPanel = undefined;
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
      extensionUri,
    );
  }

  private async loadContent() {
    FileNotesSummaryProvider.outputChannel.appendLine(`Loading summary for file: ${this.filePath}`);
    FileNotesSummaryProvider.outputChannel.appendLine(`Notes count: ${this.notes.length}`);

    if (this.abortController) {
      this.abortController.abort();
    }
    this.abortController = new AbortController();
    const signal = this.abortController.signal;
    this.relatedNotes = undefined;

    // Fire off async fetch of related notes
    const excludeIds = this.notes.map(n => n.id);
    this.kbClient.findRelatedNotesByFile(this.filePath, excludeIds, { signal })
      .then(related => {
        if (signal.aborted) return;
        this.relatedNotes = related;
        this.panel.webview.postMessage({ command: 'relatedNotesLoaded', notes: related });
      })
      .catch((err) => {
        FileNotesSummaryProvider.outputChannel.appendLine(`Error loading related notes: ${err instanceof Error ? err.message : String(err)}`);
      });

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
        this.kbClient.getFileNotesSummary(this.filePath, { signal }),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('Request timeout after 30 seconds')), 30000)
        )
      ]) as any;

      if (signal.aborted) return;

      FileNotesSummaryProvider.outputChannel.appendLine('Summary loaded successfully');
      this.panel.webview.html = this.getHtml(summary, this.notes);
    } catch (error) {
      if (signal.aborted) return;

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

      await NoteDetailWebviewProvider.show(this.extensionUri, this.kbClient, noteId);
      FileNotesSummaryProvider.outputChannel.appendLine('Note detail opened');
    } catch (error) {
      FileNotesSummaryProvider.outputChannel.appendLine(`Error opening note: ${error instanceof Error ? error.message : String(error)}`);
      FileNotesSummaryProvider.outputChannel.show();
      vscode.window.showErrorMessage('Failed to open note');
    }
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

      let relatedHtml = '';
      if (this.relatedNotes === undefined) {
        relatedHtml = `
          <div class="related-section">
            <h3 class="related-title-container">💡 Related Notes <span class="badge">Searching...</span></h3>
            <div id="related-notes-container">
              <div class="loading-section" style="padding: 15px; margin: 10px 0;">
                <div class="spinner" style="width: 20px; height: 20px; border-width: 2px;"></div>
                <p style="font-size: 0.9em; margin: 5px 0 0 0; color: var(--vscode-descriptionForeground);">Searching for semantic matches...</p>
              </div>
            </div>
          </div>
        `;
      } else if (this.relatedNotes.length > 0) {
        const items = this.relatedNotes.map(note => {
          const noteId = note?.id || '';
          const title = note?.title || 'Untitled';
          const summary = note?.summary || 'No summary';
          return `
            <div class="note-item related-item" onclick="openNote('${this.escapeHtml(String(noteId))}')">
              <div class="note-title">${this.escapeHtml(title)} <span class="badge">Related</span></div>
              <div class="note-summary">${this.escapeHtml(summary).substring(0, 200)}${summary && summary.length > 200 ? '...' : ''}</div>
            </div>
          `;
        }).join('');
        relatedHtml = `
          <div class="related-section">
            <h3 class="related-title-container">💡 Related Notes <span class="badge">${this.relatedNotes.length}</span></h3>
            <div id="related-notes-container">
              ${items}
            </div>
          </div>
        `;
      } else {
        relatedHtml = `
          <div class="related-section">
            <h3 class="related-title-container">💡 Related Notes</h3>
            <div id="related-notes-container">
              <p style="font-style: italic; color: var(--vscode-descriptionForeground);">No related notes found.</p>
            </div>
          </div>
        `;
      }

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

    /* Related notes styling */
    .related-section {
      margin-top: 32px;
      padding-top: 20px;
      border-top: 1px dashed var(--vscode-panel-border);
    }
    .related-title-container {
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .badge {
      font-size: 0.75em;
      padding: 2px 6px;
      border-radius: 4px;
      background: var(--vscode-badge-background);
      color: var(--vscode-badge-foreground);
      font-weight: normal;
    }
    .note-item.related-item {
      border-style: dashed;
      opacity: 0.85;
    }
    .note-item.related-item:hover {
      opacity: 1;
    }
  </style>
</head>
<body>
  <h1>💡 Kote File Notes Summary</h1>
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

  ${relatedHtml}

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

    // Related notes listener
    window.addEventListener('message', event => {
      const message = event.data;
      if (message.command === 'relatedNotesLoaded') {
        const related = message.notes || [];
        const container = document.getElementById('related-notes-container');
        const badge = document.querySelector('.related-title-container .badge');
        if (!container) return;
        
        if (related.length === 0) {
          container.innerHTML = '<p style="font-style: italic; color: var(--vscode-descriptionForeground); margin: 10px 0;">No related notes found.</p>';
          if (badge) badge.remove();
          return;
        }
        
        if (badge) {
          badge.textContent = related.length;
        }
        
        container.innerHTML = related.map(note => {
          const noteId = note?.id || '';
          const title = note?.title || 'Untitled';
          const summary = note?.summary || 'No summary';
          return \`
            <div class="note-item related-item" onclick="openNote('\${escapeHtmlString(noteId)}')">
              <div class="note-title">\${escapeHtmlString(title)} <span class="badge">Related</span></div>
              <div class="note-summary">\${escapeHtmlString(summary).substring(0, 200)}\${summary && summary.length > 200 ? '...' : ''}</div>
            </div>
          \`;
        }).join('');
      }
    });

    function escapeHtmlString(text) {
      const map = {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#039;',
      };
      return String(text).replace(/[&<>"']/g, (char) => map[char]);
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
      cursor: pointer;
      transition: border-left-color 0.2s;
    }
    .timeline-item:hover {
      border-left-color: var(--vscode-button-background);
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
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .timeline-description {
      color: var(--vscode-foreground);
    }
    .note-link {
      font-size: 0.85em;
      color: var(--vscode-textLink-foreground);
      text-decoration: none;
      font-weight: normal;
    }
    .note-link:hover {
      text-decoration: underline;
    }
    
    /* Tabs Layout */
    .tabs-container {
      margin-top: 30px;
      border-top: 1px solid var(--vscode-panel-border);
      padding-top: 20px;
    }
    .tabs-header {
      display: flex;
      gap: 12px;
      border-bottom: 1px solid var(--vscode-panel-border);
      margin-bottom: 16px;
    }
    .tab-button {
      background: none;
      border: none;
      border-bottom: 2px solid transparent;
      color: var(--vscode-foreground);
      opacity: 0.7;
      padding: 8px 12px;
      cursor: pointer;
      font-size: var(--vscode-font-size);
      font-weight: 500;
      display: flex;
      align-items: center;
      gap: 6px;
    }
    .tab-button:hover {
      opacity: 1;
    }
    .tab-button.active {
      border-bottom-color: var(--vscode-button-background);
      opacity: 1;
      font-weight: 600;
    }
    .tab-content {
      display: none;
    }
    .tab-content.active {
      display: block;
    }

    .notes-list {
      margin-top: 0;
    }
    .note-item {
      padding: 10px;
      margin-bottom: 10px;
      background-color: var(--vscode-editor-inactiveSelectionBackground);
      border: 1px solid var(--vscode-panel-border);
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

    /* Related notes styling */
    .badge {
      font-size: 0.75em;
      padding: 2px 6px;
      border-radius: 4px;
      background: var(--vscode-badge-background);
      color: var(--vscode-badge-foreground);
      font-weight: normal;
    }
    .note-item.related-item {
      border-style: dashed;
      opacity: 0.85;
    }
    .note-item.related-item:hover {
      opacity: 1;
    }
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
  </style>
</head>
<body>
  <button class="copy-button" onclick="copySummary()">Copy Summary</button>
  
  <h1>💡 Kote File Notes Summary</h1>
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
    ${[...summary.timeline].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()).map(item => `
      <div class="timeline-item" onclick="openNote('${this.escapeHtml(item.noteId)}')">
        <div class="timeline-date">${this.escapeHtml(item.date)}</div>
        <div class="timeline-title">
          <span>${this.escapeHtml(item.title)}</span>
          <a href="#" class="note-link" onclick="event.stopPropagation(); event.preventDefault(); openNote('${this.escapeHtml(item.noteId)}')">View note →</a>
        </div>
        <div class="timeline-description">${this.escapeHtml(item.description)}</div>
      </div>
    `).join('')}
  </div>

  <div class="tabs-container">
    <div class="tabs-header">
      <button class="tab-button active" onclick="selectTab('linked-notes')">Linked Notes <span class="badge">${notes.length}</span></button>
      <button class="tab-button" onclick="selectTab('related-notes')">Related Notes <span class="badge" id="related-badge">${this.relatedNotes === undefined ? 'Searching...' : this.relatedNotes.length}</span></button>
    </div>
    
    <div id="linked-notes" class="tab-content active">
      <div class="notes-list">
        ${notes.map(note => `
          <div class="note-item" onclick="openNote('${this.escapeHtml(String(note.id))}')">
            <div class="note-title">${this.escapeHtml(note.title || 'Untitled')}</div>
            <div class="note-summary">${this.escapeHtml(note.summary || 'No summary').substring(0, 200)}${note.summary && note.summary.length > 200 ? '...' : ''}</div>
          </div>
        `).join('')}
      </div>
    </div>
    
    <div id="related-notes" class="tab-content">
      <div id="related-notes-container">
        ${this.relatedNotes === undefined ? `
          <div class="loading-section" style="padding: 15px; margin: 10px 0;">
            <div class="spinner" style="width: 20px; height: 20px; border-width: 2px;"></div>
            <p style="font-size: 0.9em; margin: 5px 0 0 0; color: var(--vscode-descriptionForeground);">Searching for semantic matches...</p>
          </div>
        ` : this.relatedNotes.length > 0 ? this.relatedNotes.map(note => {
            const noteId = note?.id || '';
            const title = note?.title || 'Untitled';
            const summary = note?.summary || 'No summary';
            return `
              <div class="note-item related-item" onclick="openNote('${this.escapeHtml(String(noteId))}')">
                <div class="note-title">${this.escapeHtml(title)} <span class="badge">Related</span></div>
                <div class="note-summary">${this.escapeHtml(summary).substring(0, 200)}${summary && summary.length > 200 ? '...' : ''}</div>
              </div>
            `;
          }).join('') : `
          <p style="font-style: italic; color: var(--vscode-descriptionForeground); margin: 10px 0;">No related notes found.</p>
        `}
      </div>
    </div>
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

    function selectTab(tabId) {
      document.querySelectorAll('.tab-button').forEach(btn => btn.classList.remove('active'));
      document.querySelectorAll('.tab-content').forEach(content => content.classList.remove('active'));
      
      const activeBtn = document.querySelector(\`.tab-button[onclick="selectTab('\${tabId}')"]\`);
      const activeContent = document.getElementById(tabId);
      if (activeBtn) activeBtn.classList.add('active');
      if (activeContent) activeContent.classList.add('active');
    }

    function copySummary() {
      const markdown = \`# 💡 Kote File Notes Summary

**File:** ${this.escapeHtml(this.filePath)}

## Summary
\${summary.summary}

## Understanding
\${summary.understanding}

## Timeline
\${summary.timeline.map(item => \`- **\${item.date}**: \${item.title}
  - \${item.description}\`).join('\\n')}

## Linked Notes (\${notes.length})
\${notes.map(note => \`- **\${note.title || 'Untitled'}**: \${note.summary || 'No summary'}\`).join('\\n')}
\`;
      vscode.postMessage({
        command: 'copyContent',
        content: markdown
      });
    }

    // Related notes listener
    window.addEventListener('message', event => {
      const message = event.data;
      if (message.command === 'relatedNotesLoaded') {
        const related = message.notes || [];
        const container = document.getElementById('related-notes-container');
        const badge = document.getElementById('related-badge');
        if (!container) return;
        
        if (badge) {
          badge.textContent = related.length;
        }
        
        if (related.length === 0) {
          container.innerHTML = '<p style="font-style: italic; color: var(--vscode-descriptionForeground); margin: 10px 0;">No related notes found.</p>';
          return;
        }
        
        container.innerHTML = related.map(note => {
          const noteId = note?.id || '';
          const title = note?.title || 'Untitled';
          const summary = note?.summary || 'No summary';
          return \`
            <div class="note-item related-item" onclick="openNote('\${escapeHtmlString(noteId)}')">
              <div class="note-title">\${escapeHtmlString(title)} <span class="badge">Related</span></div>
              <div class="note-summary">\${escapeHtmlString(summary).substring(0, 200)}\${summary && summary.length > 200 ? '...' : ''}</div>
            </div>
          \`;
        }).join('');
      }
    });

    function escapeHtmlString(text) {
      const map = {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#039;',
      };
      return String(text).replace(/[&<>"']/g, (char) => map[char]);
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
    if (this.abortController) {
      this.abortController.abort();
    }
    FileNotesSummaryProvider.currentPanel = undefined;
    this.panel.dispose();
    while (this.disposables.length) {
      const disposable = this.disposables.pop();
      if (disposable) disposable.dispose();
    }
  }
}
