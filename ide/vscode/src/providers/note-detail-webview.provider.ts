import * as vscode from 'vscode';
import { KbClient } from '../kb-client';

export class NoteDetailWebviewProvider {
  private static currentPanel: NoteDetailWebviewProvider | undefined;
  private readonly panel: vscode.WebviewPanel;
  private readonly kbClient: KbClient;
  private disposables: vscode.Disposable[] = [];

  private constructor(
    panel: vscode.WebviewPanel,
    kbClient: KbClient,
    private noteId: string,
  ) {
    this.panel = panel;
    this.kbClient = kbClient;

    this.panel.onDidDispose(() => this.dispose(), null, this.disposables);
    this.panel.webview.onDidReceiveMessage(
      async (message) => {
        switch (message.command) {
          case 'openOnWeb':
            await this.openOnWeb(message.url);
            return;
        }
      },
      null,
      this.disposables,
    );

    this.loadNote();
  }

  public static async show(
    extensionUri: vscode.Uri,
    kbClient: KbClient,
    noteId: string,
  ) {
    const column = vscode.window.activeTextEditor
      ? vscode.window.activeTextEditor.viewColumn
      : undefined;

    if (NoteDetailWebviewProvider.currentPanel) {
      NoteDetailWebviewProvider.currentPanel.panel.dispose();
      NoteDetailWebviewProvider.currentPanel = undefined;
    }

    const panel = vscode.window.createWebviewPanel(
      'kote.noteDetail',
      'Kote: Note Detail',
      column || vscode.ViewColumn.One,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [
          vscode.Uri.joinPath(extensionUri, 'media'),
        ],
      },
    );

    NoteDetailWebviewProvider.currentPanel = new NoteDetailWebviewProvider(
      panel,
      kbClient,
      noteId,
    );
  }

  private async loadNote() {
    this.panel.webview.html = this.getLoadingHtml();

    try {
      const note = await this.kbClient.getNote(this.noteId);
      if (!note) {
        this.panel.webview.html = this.getErrorHtml('Note not found');
        return;
      }

      this.panel.webview.html = this.getHtml(note);
    } catch (error) {
      this.panel.webview.html = this.getErrorHtml(
        error instanceof Error ? error.message : String(error),
      );
    }
  }

  private getLoadingHtml(): string {
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline';">
  <style>
    ${this.getBaseStyles()}
    .loading {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
    }
    .spinner {
      border: 3px solid var(--vscode-progressBar-background);
      border-top: 3px solid var(--vscode-progressBar-foreground);
      border-radius: 50%;
      width: 40px;
      height: 40px;
      animation: spin 1s linear infinite;
      margin-bottom: 20px;
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
    <p>Loading note...</p>
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
    ${this.getBaseStyles()}
    .error {
      background-color: var(--vscode-errorBackground);
      color: var(--vscode-errorForeground);
      padding: 20px;
      border-radius: 6px;
      margin: 20px;
    }
  </style>
</head>
<body>
  <div class="error">
    <h3>Error loading note</h3>
    <p>${this.escapeHtml(error)}</p>
  </div>
</body>
</html>`;
  }

  private getHtml(note: any): string {
    const createdDate = note.occurredAt || note.date || note.createdAt || new Date().toISOString();
    const formattedDate = new Date(createdDate).toLocaleString();
    const webBase = this.kbClient.apiUrl.replace(/\/api$/, '');
    const noteWebUrl = `${webBase}/vault/${note.id}`;
    const content = note.content || note.rawText || note.summary || 'No content available';

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline';">
  <style>
    ${this.getBaseStyles()}
    ${this.getNoteStyles()}
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>${this.escapeHtml(note.title || 'Untitled')}</h1>
      <div class="metadata">
        <div class="metadata-item">
          <span class="label">Source:</span>
          <span class="value">${this.escapeHtml(note.sourceChannel || 'kote')}</span>
        </div>
        <div class="metadata-item">
          <span class="label">Project:</span>
          <span class="value">${this.escapeHtml(note.projectSlug || 'Inbox')}</span>
        </div>
        <div class="metadata-item">
          <span class="label">Created:</span>
          <span class="value">${this.escapeHtml(formattedDate)}</span>
        </div>
      </div>
      <div class="actions">
        <a href="${noteWebUrl}" target="_blank" class="action-button">
          View on Kote Web &rarr;
        </a>
      </div>
    </div>

    <div class="content">
      <div class="content-text">${this.escapeHtml(content)}</div>
    </div>
  </div>

  <script>
    const vscode = acquireVsCodeApi();
  </script>
</body>
</html>`;
  }

  private getBaseStyles(): string {
    return `
    :root {
      --bg: var(--vscode-editor-background);
      --fg: var(--vscode-foreground);
      --border: var(--vscode-widget-border, var(--vscode-panel-border, rgba(148, 163, 184, 0.14)));
      --card-bg: var(--vscode-editorWidget-background, rgba(15, 23, 29, 0.65));
      --card-hover: var(--vscode-list-hoverBackground, rgba(83, 199, 222, 0.08));
      --accent: #53c7de;
      --accent-soft: rgba(83, 199, 222, 0.12);
      --desc: var(--vscode-descriptionForeground, #8da0ae);
      --radius: 8px;
    }
    body {
      font-family: var(--vscode-font-family, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif);
      font-size: var(--vscode-font-size, 13px);
      color: var(--fg);
      background-color: var(--bg);
      margin: 0;
      padding: 0;
    }
    .container {
      max-width: 900px;
      margin: 0 auto;
      padding: 20px;
    }`;
  }

  private getNoteStyles(): string {
    return `
    .header {
      padding: 20px;
      border-bottom: 1px solid var(--border);
      margin-bottom: 20px;
    }
    .header h1 {
      margin: 0 0 16px 0;
      font-size: 1.5em;
      font-weight: 600;
    }
    .metadata {
      display: flex;
      flex-wrap: wrap;
      gap: 16px;
      margin-bottom: 16px;
    }
    .metadata-item {
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .label {
      font-weight: 600;
      color: var(--desc);
    }
    .value {
      color: var(--fg);
    }
    .actions {
      display: flex;
      gap: 12px;
    }
    .action-button {
      padding: 6px 14px;
      background-color: var(--card-bg);
      color: var(--accent);
      border: 1px solid var(--accent);
      border-radius: 6px;
      cursor: pointer;
      font-size: var(--vscode-font-size);
      font-weight: 500;
      text-decoration: none;
      display: inline-flex;
      align-items: center;
      gap: 6px;
      transition: all 0.2s ease;
    }
    .action-button:hover {
      background-color: var(--accent-soft);
      border-color: var(--accent);
    }
    .content {
      padding: 20px;
      background-color: var(--vscode-editor-background);
      border-radius: 6px;
    }
    .content-text {
      line-height: 1.6;
      white-space: pre-wrap;
      word-wrap: break-word;
    }`;
  }

  private async openOnWeb(url: string) {
    await vscode.env.openExternal(vscode.Uri.parse(url));
  }

  private escapeHtml(text: string): string {
    const map: { [key: string]: string } = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#039;',
    };
    return text.replace(/[&<>"']/g, (char) => map[char]);
  }

  public dispose() {
    NoteDetailWebviewProvider.currentPanel = undefined;
    this.panel.dispose();
    while (this.disposables.length) {
      const disposable = this.disposables.pop();
      if (disposable) {
        disposable.dispose();
      }
    }
  }
}
