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
          case 'copyContent':
            await this.copyContent(message.content);
            return;
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
        <button class="action-button" onclick="copyContent()">
          Copy
        </button>
        <a href="${noteWebUrl}" target="_blank" class="action-button">
          🌐 View on Web
        </a>
      </div>
    </div>

    <div class="content">
      <div class="content-text">${this.escapeHtml(content)}</div>
    </div>
  </div>

  <script>
    const vscode = acquireVsCodeApi();
    const content = ${JSON.stringify(content)};

    function copyContent() {
      vscode.postMessage({ command: 'copyContent', content });
    }

    function openOnWeb(url) {
      vscode.postMessage({ command: 'openOnWeb', url });
    }
  </script>
</body>
</html>`;
  }

  private getBaseStyles(): string {
    return `
    body {
      font-family: var(--vscode-font-family);
      font-size: var(--vscode-font-size);
      color: var(--vscode-foreground);
      background-color: var(--vscode-editor-background);
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
      border-bottom: 1px solid var(--vscode-panel-border);
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
      color: var(--vscode-descriptionForeground);
    }
    .value {
      color: var(--vscode-foreground);
    }
    .actions {
      display: flex;
      gap: 12px;
    }
    .action-button {
      padding: 8px 16px;
      background-color: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
      border: none;
      border-radius: 4px;
      cursor: pointer;
      font-size: var(--vscode-font-size);
      text-decoration: none;
      display: inline-flex;
      align-items: center;
      gap: 6px;
    }
    .action-button:hover {
      background-color: var(--vscode-button-hoverBackground);
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

  private async copyContent(content: string) {
    await vscode.env.clipboard.writeText(content);
    vscode.window.showInformationMessage('Content copied to clipboard');
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
