import * as vscode from 'vscode';
import type { KbClient } from '../kb-client';
import type { SnippetNoteMatch, SnippetNotesResponse } from '../types';
import type { GitSnippetOriginInfo } from '../utils/git-blame';
import { NoteDetailWebviewProvider } from './note-detail-webview.provider';

export interface SnippetOriginInput {
  filePath: string;
  snippet: string;
  startLine: number;
  endLine: number;
  gitInfo: GitSnippetOriginInfo | null;
}

export class SnippetOriginSummaryProvider {
  private static currentPanel: SnippetOriginSummaryProvider | undefined;
  private readonly panel: vscode.WebviewPanel;
  private readonly disposables: vscode.Disposable[] = [];
  private static outputChannel: vscode.OutputChannel;
  private abortController: AbortController | undefined;

  private constructor(
    panel: vscode.WebviewPanel,
    private readonly kbClient: KbClient,
    private readonly input: SnippetOriginInput,
    private readonly extensionUri: vscode.Uri,
  ) {
    this.panel = panel;

    if (!SnippetOriginSummaryProvider.outputChannel) {
      SnippetOriginSummaryProvider.outputChannel = vscode.window.createOutputChannel('Kote Snippet Origin');
    }

    this.panel.onDidDispose(() => this.dispose(), null, this.disposables);

    this.panel.webview.onDidReceiveMessage(
      async (message) => {
        switch (message.command) {
          case 'openNote':
            await this.openNote(message.noteId);
            return;
          case 'refresh':
            await this.loadContent();
            return;
          case 'copyText':
            await vscode.env.clipboard.writeText(message.text || '');
            vscode.window.showInformationMessage('Copied to clipboard');
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
    input: SnippetOriginInput,
  ) {
    const column = vscode.window.activeTextEditor
      ? vscode.window.activeTextEditor.viewColumn
      : undefined;

    if (SnippetOriginSummaryProvider.currentPanel) {
      SnippetOriginSummaryProvider.currentPanel.panel.dispose();
      SnippetOriginSummaryProvider.currentPanel = undefined;
    }

    const panel = vscode.window.createWebviewPanel(
      'kote.snippetOriginSummary',
      `Kote: Code Origin - ${input.filePath}:${input.startLine}-${input.endLine}`,
      column || vscode.ViewColumn.Beside,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [
          vscode.Uri.joinPath(extensionUri, 'media'),
        ],
      },
    );

    SnippetOriginSummaryProvider.currentPanel = new SnippetOriginSummaryProvider(
      panel,
      kbClient,
      input,
      extensionUri,
    );
  }

  private async loadContent() {
    if (this.abortController) {
      this.abortController.abort();
    }
    this.abortController = new AbortController();
    const signal = this.abortController.signal;

    this.panel.webview.html = this.getLoadingHtml();

    try {
      const response: SnippetNotesResponse = await this.kbClient.findNotesBySnippet({
        filePath: this.input.filePath,
        codeSnippet: this.input.snippet,
        commitHash: this.input.gitInfo?.commitHash,
        commitDate: this.input.gitInfo?.commitDate,
        author: this.input.gitInfo?.author,
        commitMessage: this.input.gitInfo?.commitMessage,
      }, { signal });

      if (signal.aborted) return;
      this.panel.webview.html = this.getMainHtml(response);
    } catch (err) {
      if (signal.aborted) return;
      SnippetOriginSummaryProvider.outputChannel.appendLine(`Error loading snippet notes: ${err instanceof Error ? err.message : String(err)}`);
      this.panel.webview.html = this.getErrorHtml(err instanceof Error ? err.message : String(err));
    }
  }

  private async openNote(noteId: string) {
    try {
      await NoteDetailWebviewProvider.show(this.extensionUri, this.kbClient, noteId);
    } catch (error) {
      vscode.window.showErrorMessage('Failed to open note detail');
    }
  }

  private dispose() {
    SnippetOriginSummaryProvider.currentPanel = undefined;
    if (this.abortController) {
      this.abortController.abort();
    }
    this.panel.dispose();
    while (this.disposables.length) {
      const x = this.disposables.pop();
      if (x) x.dispose();
    }
  }

  private escapeHtml(text: string): string {
    return (text || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  private formatDate(dateStr?: string): string {
    if (!dateStr) return '';
    try {
      const d = new Date(dateStr);
      if (isNaN(d.getTime())) return dateStr;
      return d.toLocaleDateString(undefined, {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return dateStr;
    }
  }

  private getSourceBadge(sourceChannel?: string, source?: string): { label: string; icon: string; className: string } {
    const s = (sourceChannel || source || '').toLowerCase();
    if (s.includes('claude')) return { label: 'Claude Code', icon: '🤖', className: 'badge-claude' };
    if (s.includes('antigravity')) return { label: 'Antigravity', icon: '✨', className: 'badge-antigravity' };
    if (s.includes('codex')) return { label: 'Codex', icon: '💻', className: 'badge-codex' };
    if (s.includes('opencode')) return { label: 'OpenCode', icon: '⚡', className: 'badge-opencode' };
    if (s.includes('whatsapp')) return { label: 'WhatsApp', icon: '💬', className: 'badge-whatsapp' };
    if (s.includes('telegram')) return { label: 'Telegram', icon: '✈️', className: 'badge-telegram' };
    if (s.includes('github') || s.includes('commit')) return { label: 'Git Commit', icon: '🔀', className: 'badge-git' };
    return { label: 'Note', icon: '📝', className: 'badge-note' };
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
      padding: 30px 20px;
      display: flex;
      justify-content: center;
      align-items: center;
      min-height: 80vh;
      margin: 0;
    }
    .spinner {
      border: 3px solid var(--vscode-progressBar-background, rgba(255,255,255,0.1));
      border-top: 3px solid var(--vscode-button-background, #007ACC);
      border-radius: 50%;
      width: 36px;
      height: 36px;
      animation: spin 0.9s linear infinite;
      margin: 0 auto 16px;
    }
    @keyframes spin {
      0% { transform: rotate(0deg); }
      100% { transform: rotate(360deg); }
    }
    .loading-text {
      text-align: center;
      color: var(--vscode-descriptionForeground);
    }
  </style>
</head>
<body>
  <div class="loading-text">
    <div class="spinner"></div>
    <p>Searching Git commit history and related AI sessions…</p>
  </div>
</body>
</html>`;
  }

  private getErrorHtml(errorMsg: string): string {
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
      padding: 24px;
    }
    .error-box {
      background-color: var(--vscode-inputValidation-errorBackground, rgba(255,0,0,0.1));
      border: 1px solid var(--vscode-inputValidation-errorBorder, #f44336);
      padding: 16px;
      border-radius: 6px;
      margin-bottom: 16px;
    }
    button {
      background: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
      border: none;
      padding: 8px 16px;
      border-radius: 4px;
      cursor: pointer;
    }
  </style>
</head>
<body>
  <div class="error-box">
    <strong>Failed to load code origin</strong>
    <p>${this.escapeHtml(errorMsg)}</p>
  </div>
  <button onclick="acquireVsCodeApi().postMessage({ command: 'refresh' })">Try Again</button>
</body>
</html>`;
  }

  private getMainHtml(response: SnippetNotesResponse): string {
    const git = response.gitContext || this.input.gitInfo;
    const matches = response.matches || [];
    const hasGit = Boolean(git && git.commitHash);

    const timelineItems = matches.map((match) => {
      const note = match.note;
      const relevance = match.relevance;
      const badge = this.getSourceBadge(note.sourceChannel, note.canonicalType);
      const isOrigin = relevance.isOriginMatch;
      const formattedDate = this.formatDate(note.date || note.createdAt);

      return `
        <div class="timeline-item ${isOrigin ? 'origin-match' : ''}" onclick="openNote('${this.escapeHtml(note.id)}')">
          <div class="timeline-dot ${isOrigin ? 'dot-origin' : ''}"></div>
          <div class="card">
            <div class="card-header">
              <div class="badge ${badge.className}">
                <span>${badge.icon}</span> ${this.escapeHtml(badge.label)}
              </div>
              ${isOrigin ? '<div class="badge badge-origin">🌟 Commit Origin Match</div>' : ''}
              <span class="card-date">${this.escapeHtml(formattedDate)}</span>
            </div>
            <h3 class="card-title">${this.escapeHtml(note.title || 'Untitled Note')}</h3>
            <p class="card-summary">${this.escapeHtml(note.summary || 'Click to view details')}</p>
            ${relevance.reason ? `<div class="card-reason">💡 ${this.escapeHtml(relevance.reason)}</div>` : ''}
            <div class="card-footer">
              <span class="view-link">View conversation / note &rarr;</span>
            </div>
          </div>
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
    :root {
      --bg: var(--vscode-editor-background);
      --fg: var(--vscode-foreground);
      --border: var(--vscode-panel-border, rgba(128, 128, 128, 0.2));
      --card-bg: var(--vscode-editorWidget-background, rgba(255, 255, 255, 0.04));
      --card-hover: var(--vscode-list-hoverBackground, rgba(255, 255, 255, 0.08));
      --accent: var(--vscode-textLink-foreground, #3794ff);
      --desc: var(--vscode-descriptionForeground, #888);
    }

    * { box-sizing: border-box; }

    body {
      font-family: var(--vscode-font-family);
      font-size: var(--vscode-font-size);
      color: var(--fg);
      background-color: var(--bg);
      padding: 24px;
      margin: 0;
      line-height: 1.5;
    }

    .header {
      margin-bottom: 20px;
      padding-bottom: 16px;
      border-bottom: 1px solid var(--border);
    }

    .title-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      flex-wrap: wrap;
    }

    .main-title {
      font-size: 1.3em;
      font-weight: 600;
      margin: 0;
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .file-path {
      font-size: 0.9em;
      color: var(--desc);
      font-family: var(--vscode-editor-font-family, monospace);
      margin-top: 4px;
    }

    /* Git Box */
    .git-card {
      background: var(--card-bg);
      border: 1px solid var(--border);
      border-left: 4px solid #8957e5;
      border-radius: 6px;
      padding: 12px 16px;
      margin: 16px 0;
    }

    .git-card-title {
      font-size: 0.85em;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      color: #a371f7;
      margin-bottom: 6px;
      display: flex;
      align-items: center;
      gap: 6px;
    }

    .git-info-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
      gap: 8px;
      font-size: 0.9em;
    }

    .git-item strong {
      color: var(--desc);
      font-weight: normal;
    }

    .git-commit-msg {
      margin-top: 8px;
      font-style: italic;
      color: var(--fg);
    }

    /* Snippet container */
    .snippet-card {
      background: var(--vscode-editor-background);
      border: 1px solid var(--border);
      border-radius: 6px;
      margin: 16px 0 24px;
      overflow: hidden;
    }

    .snippet-header {
      background: var(--card-bg);
      padding: 6px 12px;
      font-size: 0.8em;
      color: var(--desc);
      display: flex;
      justify-content: space-between;
      align-items: center;
      border-bottom: 1px solid var(--border);
    }

    .snippet-code {
      padding: 12px;
      margin: 0;
      font-family: var(--vscode-editor-font-family, monospace);
      font-size: 0.9em;
      overflow-x: auto;
      white-space: pre;
    }

    /* Timeline */
    .section-title {
      font-size: 1.1em;
      font-weight: 600;
      margin: 24px 0 16px;
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .timeline {
      position: relative;
      padding-left: 24px;
      margin-left: 8px;
      border-left: 2px solid var(--border);
    }

    .timeline-item {
      position: relative;
      margin-bottom: 20px;
      cursor: pointer;
    }

    .timeline-dot {
      position: absolute;
      left: -31px;
      top: 14px;
      width: 12px;
      height: 12px;
      border-radius: 50%;
      background: var(--border);
      border: 2px solid var(--bg);
      transition: all 0.2s ease;
    }

    .timeline-item:hover .timeline-dot {
      background: var(--accent);
      transform: scale(1.2);
    }

    .timeline-dot.dot-origin {
      background: #e3b341;
      box-shadow: 0 0 8px rgba(227, 179, 65, 0.5);
    }

    .card {
      background: var(--card-bg);
      border: 1px solid var(--border);
      border-radius: 6px;
      padding: 14px 16px;
      transition: background 0.15s ease, border-color 0.15s ease, transform 0.15s ease;
    }

    .timeline-item:hover .card {
      background: var(--card-hover);
      border-color: var(--accent);
      transform: translateX(2px);
    }

    .timeline-item.origin-match .card {
      border-left: 3px solid #e3b341;
    }

    .card-header {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-bottom: 8px;
      flex-wrap: wrap;
    }

    .card-date {
      font-size: 0.8em;
      color: var(--desc);
      margin-left: auto;
    }

    .card-title {
      margin: 0 0 6px;
      font-size: 1.05em;
      font-weight: 600;
      color: var(--fg);
    }

    .card-summary {
      margin: 0 0 8px;
      font-size: 0.9em;
      color: var(--desc);
    }

    .card-reason {
      font-size: 0.8em;
      color: #e3b341;
      background: rgba(227, 179, 65, 0.1);
      padding: 4px 8px;
      border-radius: 4px;
      display: inline-block;
      margin-bottom: 8px;
    }

    .card-footer {
      font-size: 0.8em;
      color: var(--accent);
      font-weight: 500;
    }

    /* Badges */
    .badge {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      font-size: 0.75em;
      padding: 2px 8px;
      border-radius: 12px;
      font-weight: 500;
      background: rgba(255,255,255,0.08);
    }

    .badge-claude { background: rgba(217, 119, 6, 0.15); color: #f59e0b; }
    .badge-antigravity { background: rgba(59, 130, 246, 0.15); color: #60a5fa; }
    .badge-codex { background: rgba(16, 185, 129, 0.15); color: #34d399; }
    .badge-opencode { background: rgba(139, 92, 246, 0.15); color: #a78bfa; }
    .badge-origin { background: rgba(227, 179, 65, 0.2); color: #fbbf24; font-weight: 600; }

    /* Empty state */
    .empty-state {
      background: var(--card-bg);
      border: 1px dashed var(--border);
      border-radius: 6px;
      padding: 24px;
      text-align: center;
      color: var(--desc);
      margin-top: 16px;
    }

    .btn {
      background: var(--card-bg);
      color: var(--fg);
      border: 1px solid var(--border);
      padding: 4px 10px;
      border-radius: 4px;
      cursor: pointer;
      font-size: 0.8em;
    }
    .btn:hover { background: var(--card-hover); }
  </style>
</head>
<body>
  <div class="header">
    <div class="title-row">
      <h1 class="main-title">💡 Kote: Code Origin & History</h1>
      <button class="btn" onclick="copySnippet()">Copy Snippet</button>
    </div>
    <div class="file-path">${this.escapeHtml(this.input.filePath)} (Lines ${this.input.startLine}–${this.input.endLine})</div>
  </div>

  ${hasGit ? `
  <div class="git-card">
    <div class="git-card-title">🔀 Git Commit Origin</div>
    <div class="git-info-grid">
      <div class="git-item"><strong>Commit:</strong> <code>${this.escapeHtml(git?.commitHash?.slice(0, 7) || '')}</code></div>
      <div class="git-item"><strong>Author:</strong> ${this.escapeHtml(git?.author || '')}</div>
      <div class="git-item"><strong>Date:</strong> ${this.escapeHtml(this.formatDate(git?.commitDate))}</div>
    </div>
    ${git?.commitMessage ? `<div class="git-commit-msg">"${this.escapeHtml(git.commitMessage)}"</div>` : ''}
  </div>
  ` : ''}

  <div class="snippet-card">
    <div class="snippet-header">
      <span>Inspected Code Snippet</span>
    </div>
    <pre class="snippet-code"><code>${this.escapeHtml(this.input.snippet)}</code></pre>
  </div>

  <div class="section-title">
    <span>⏱️ AI Sessions & Decisions Timeline (${matches.length})</span>
  </div>

  ${matches.length > 0 ? `
    <div class="timeline">
      ${timelineItems}
    </div>
  ` : `
    <div class="empty-state">
      <p>No recorded AI sessions or notes specifically matched this code snippet in <code>${this.escapeHtml(this.input.filePath)}</code>.</p>
      <p style="font-size: 0.85em;">Origin recorded via Git commit history above.</p>
    </div>
  `}

  <script>
    const vscode = acquireVsCodeApi();

    function openNote(noteId) {
      vscode.postMessage({ command: 'openNote', noteId });
    }

    function copySnippet() {
      vscode.postMessage({ command: 'copyText', text: ${JSON.stringify(this.input.snippet)} });
    }
  </script>
</body>
</html>`;
  }
}
