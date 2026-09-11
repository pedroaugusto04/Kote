import * as vscode from 'vscode';
import { KOTE_WEBVIEW_FOUNDATION_STYLES } from './kote-webview-design';

export type SessionHandoffViewParams = {
  sourceProvider: string;
  targetProviderName: string;
  sourceTitle?: string;
  sourceTimestamp?: string;
  projectSlug?: string;
  initialMarkdown?: string;
};

export class SessionHandoffViewProvider {
  private static currentPanel: SessionHandoffViewProvider | undefined;
  private readonly panel: vscode.WebviewPanel;
  private readonly disposables: vscode.Disposable[] = [];
  private currentMarkdown: string;

  private constructor(
    panel: vscode.WebviewPanel,
    private readonly params: SessionHandoffViewParams,
    private readonly loadHandoffPromise?: () => Promise<string>,
    private readonly onAccept?: (markdown: string) => void,
  ) {
    this.panel = panel;
    this.currentMarkdown = params.initialMarkdown || '';
    this.panel.onDidDispose(() => this.dispose(), null, this.disposables);

    this.panel.webview.onDidReceiveMessage(
      async (message) => {
        switch (message.command) {
          case 'acceptAndInject':
            await vscode.env.clipboard.writeText(this.currentMarkdown);
            vscode.window.showInformationMessage(
              `Kote: Session handoff context injected. Copied to clipboard for ${this.params.targetProviderName}.`
            );
            this.onAccept?.(this.currentMarkdown);
            this.panel.dispose();
            return;

          case 'copyOnly':
            await vscode.env.clipboard.writeText(this.currentMarkdown);
            vscode.window.showInformationMessage('Kote: Session handoff copied to clipboard.');
            return;

          case 'retry':
            void this.load();
            return;

          case 'close':
            this.panel.dispose();
            return;
        }
      },
      null,
      this.disposables,
    );

    if (this.currentMarkdown) {
      this.panel.webview.html = this.getHtml(this.currentMarkdown);
    } else if (this.loadHandoffPromise) {
      void this.load();
    }
  }

  public static show(
    params: SessionHandoffViewParams,
    extensionUri: vscode.Uri,
    loadHandoffPromise?: () => Promise<string>,
    onAccept?: (markdown: string) => void,
  ): void {
    const column = vscode.window.activeTextEditor
      ? vscode.window.activeTextEditor.viewColumn
      : undefined;

    if (SessionHandoffViewProvider.currentPanel) {
      SessionHandoffViewProvider.currentPanel.panel.dispose();
      SessionHandoffViewProvider.currentPanel = undefined;
    }

    const panel = vscode.window.createWebviewPanel(
      'kote.sessionHandoffView',
      `Kote: Session Handoff - ${params.sourceProvider} to ${params.targetProviderName}`,
      column || vscode.ViewColumn.One,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [vscode.Uri.joinPath(extensionUri, 'media')],
      },
    );

    SessionHandoffViewProvider.currentPanel = new SessionHandoffViewProvider(
      panel,
      params,
      loadHandoffPromise,
      onAccept
    );
  }

  private async load(): Promise<void> {
    if (!this.loadHandoffPromise) return;
    this.panel.webview.html = this.getLoadingHtml();

    try {
      const markdown = await this.loadHandoffPromise();
      this.currentMarkdown = markdown;
      this.panel.webview.html = this.getHtml(markdown);
    } catch (err) {
      this.panel.webview.html = this.getErrorHtml(err instanceof Error ? err.message : String(err));
    }
  }

  private dispose(): void {
    SessionHandoffViewProvider.currentPanel = undefined;
    this.panel.dispose();
    for (const d of this.disposables) {
      d.dispose();
    }
  }

  private escapeHtml(text: string): string {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  private markdownToHtml(markdown: string): string {
    const escaped = this.escapeHtml(markdown);
    return escaped
      .replace(/^### (.*$)/gim, '<h3 class="section-title">$1</h3>')
      .replace(/^## (.*$)/gim, '<h2 class="section-heading">$1</h2>')
      .replace(/^# (.*$)/gim, '<h1 class="main-heading">$1</h1>')
      .replace(/^\- (.*$)/gim, '<li>$1</li>')
      .replace(/(<li>.*<\/li>(\n|.)*?)(?=(<h|<p|<ul|$))/gim, '<ul>$1</ul>')
      .replace(/`([^`]+)`/g, '<code class="code-inline">$1</code>')
      .replace(/\n\n/g, '</p><p>')
      .replace(/\n/g, '<br/>');
  }

  private getHeaderHtml(): string {
    const sourceTitle = this.params.sourceTitle ? this.escapeHtml(this.params.sourceTitle) : '';
    const dateStr = this.params.sourceTimestamp
      ? new Date(Number(this.params.sourceTimestamp) || this.params.sourceTimestamp).toLocaleString()
      : 'Recent Session';

    return `
      <div class="handoff-banner">
        <div class="title-row">
          <div>
            <h1 class="main-title">Kote Session Handoff</h1>
            <div class="generated-meta">
              <span class="meta-tag">${this.escapeHtml(this.params.sourceProvider)}</span>
              &rarr;
              <span class="meta-tag">${this.escapeHtml(this.params.targetProviderName)}</span>
              &bull; ${dateStr}
              ${sourceTitle ? `&bull; ${sourceTitle}` : ''}
            </div>
          </div>
        </div>
      </div>
    `;
  }

  private getStyles(): string {
    return `
      ${KOTE_WEBVIEW_FOUNDATION_STYLES}

      .handoff-banner {
        background: var(--card-bg);
        border: 1px solid var(--border);
        border-radius: var(--radius);
        padding: 16px;
        margin-bottom: 20px;
      }

      .action-bar {
        display: flex;
        align-items: center;
        gap: 10px;
        margin-top: 14px;
      }

      .btn-primary {
        background: var(--accent);
        color: #0d151c;
        font-weight: 600;
        border: none;
        padding: 8px 16px;
        border-radius: var(--radius);
        cursor: pointer;
        font-size: 13px;
        transition: opacity 0.2s;
      }

      .btn-primary:hover {
        opacity: 0.9;
      }

      .btn-secondary {
        background: transparent;
        color: var(--fg);
        border: 1px solid var(--border);
        padding: 8px 14px;
        border-radius: var(--radius);
        cursor: pointer;
        font-size: 13px;
        transition: background 0.2s;
      }

      .btn-secondary:hover {
        background: var(--card-hover);
      }

      .content-box {
        background: var(--card-bg);
        border: 1px solid var(--border);
        border-radius: var(--radius);
        padding: 20px;
        margin-bottom: 20px;
      }

      .loading-section {
        background: var(--card-bg);
        border: 1px solid var(--border);
        border-radius: var(--radius);
        padding: 40px 20px;
        margin: 20px 0;
        text-align: center;
      }

      .spinner {
        border: 3px solid var(--vscode-progressBar-background, rgba(148, 163, 184, 0.2));
        border-top: 3px solid var(--vscode-progressBar-foreground, var(--accent));
        border-radius: 50%;
        width: 32px;
        height: 32px;
        animation: spin 1s linear infinite;
        margin: 0 auto 16px;
      }

      @keyframes spin {
        0% { transform: rotate(0deg); }
        100% { transform: rotate(360deg); }
      }

      .loading-title {
        font-size: 1.1em;
        font-weight: 600;
        color: var(--fg);
        margin: 0 0 6px 0;
      }

      .loading-subtitle {
        font-size: 0.9em;
        color: var(--desc);
        margin: 0;
      }

      .error-section {
        background: var(--card-bg);
        border: 1px solid var(--border);
        border-left: 4px solid var(--vscode-errorForeground, #e06c75);
        border-radius: var(--radius);
        padding: 20px;
        margin: 20px 0;
      }

      .main-heading {
        font-size: 1.3em;
        font-weight: 600;
        margin-top: 0;
        margin-bottom: 12px;
        border-bottom: 1px solid var(--border);
        padding-bottom: 8px;
      }

      .section-heading {
        font-size: 1.1em;
        font-weight: 600;
        color: var(--accent);
        margin-top: 18px;
        margin-bottom: 8px;
      }

      .section-title {
        font-size: 1.0em;
        font-weight: 600;
        margin-top: 14px;
        margin-bottom: 6px;
      }

      .code-inline {
        background: rgba(255, 255, 255, 0.08);
        padding: 2px 5px;
        border-radius: 4px;
        font-family: var(--vscode-editor-font-family, monospace);
        font-size: 0.92em;
      }

      ul {
        margin: 8px 0;
        padding-left: 20px;
      }

      li {
        margin-bottom: 6px;
      }

      .meta-tag {
        display: inline-block;
        padding: 3px 8px;
        border-radius: 4px;
        font-size: 0.82em;
        font-weight: 500;
        background: var(--accent-soft);
        color: var(--accent);
        margin-right: 6px;
      }
    `;
  }

  private getLoadingHtml(): string {
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Kote Session Handoff</title>
  <style>
    ${this.getStyles()}
  </style>
</head>
<body>
  ${this.getHeaderHtml()}

  <div class="loading-section">
    <div class="spinner"></div>
    <p class="loading-title">Generating AI session handoff...</p>
    <p class="loading-subtitle">Synthesizing goals, decisions, and next steps from previous transcript</p>
  </div>
</body>
</html>`;
  }

  private getErrorHtml(errorMessage: string): string {
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Kote Session Handoff</title>
  <style>
    ${this.getStyles()}
  </style>
</head>
<body>
  ${this.getHeaderHtml()}

  <div class="error-section">
    <h3 style="margin-top: 0;">Error generating session handoff</h3>
    <p style="color: var(--desc);">${this.escapeHtml(errorMessage)}</p>
    <div class="action-bar">
      <button class="btn-primary" onclick="retry()">Retry</button>
      <button class="btn-secondary" onclick="closeView()">Dismiss</button>
    </div>
  </div>

  <script>
    const vscode = acquireVsCodeApi();
    function retry() { vscode.postMessage({ command: 'retry' }); }
    function closeView() { vscode.postMessage({ command: 'close' }); }
  </script>
</body>
</html>`;
  }

  private getHtml(markdown: string): string {
    const contentHtml = this.markdownToHtml(markdown);

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Kote Session Handoff</title>
  <style>
    ${this.getStyles()}
  </style>
</head>
<body>
  <div class="handoff-banner">
    <div class="title-row">
      <div>
        <h1 class="main-title">Kote Session Handoff</h1>
        <div class="generated-meta">
          <span class="meta-tag">${this.escapeHtml(this.params.sourceProvider)}</span>
          &rarr;
          <span class="meta-tag">${this.escapeHtml(this.params.targetProviderName)}</span>
          &bull; ${this.params.sourceTimestamp ? new Date(Number(this.params.sourceTimestamp) || this.params.sourceTimestamp).toLocaleString() : 'Recent Session'}
          ${this.params.sourceTitle ? `&bull; ${this.escapeHtml(this.params.sourceTitle)}` : ''}
        </div>
      </div>
    </div>
    <div class="action-bar">
      <button class="btn-primary" onclick="acceptAndInject()">Accept &amp; Inject</button>
      <button class="btn-secondary" onclick="copyOnly()">Copy Markdown</button>
      <button class="btn-secondary" onclick="closeView()">Dismiss</button>
    </div>
  </div>

  <div class="content-box">
    ${contentHtml}
  </div>

  <div class="action-bar" style="justify-content: flex-end;">
    <button class="btn-primary" onclick="acceptAndInject()">Accept &amp; Inject</button>
    <button class="btn-secondary" onclick="copyOnly()">Copy Markdown</button>
    <button class="btn-secondary" onclick="closeView()">Dismiss</button>
  </div>

  <script>
    const vscode = acquireVsCodeApi();

    function acceptAndInject() {
      vscode.postMessage({ command: 'acceptAndInject' });
    }

    function copyOnly() {
      vscode.postMessage({ command: 'copyOnly' });
    }

    function closeView() {
      vscode.postMessage({ command: 'close' });
    }
  </script>
</body>
</html>`;
  }
}
