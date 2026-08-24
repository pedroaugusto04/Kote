import * as vscode from 'vscode';
import type { KbClient } from '../kb-client';
import type { SnippetNoteMatch, SnippetNotesResponse } from '../types';
import type { GitSnippetOriginInfo } from '../utils/git-blame';
import { isAiSessionChannel, resolveSourceBadge } from '../utils/source-channel';
import { NoteDetailWebviewProvider } from './note-detail-webview.provider';

export interface SnippetOriginInput {
  filePath: string;
  snippet: string;
  startLine: number;
  endLine: number;
  gitInfo: GitSnippetOriginInfo | null;
  projectSlug?: string;
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
      `Kote Code Origin: ${input.filePath}:${input.startLine}-${input.endLine}`,
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
        projectSlug: this.input.projectSlug,
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

  private getSourceBadge(sourceChannel?: string, source?: string): { label: string; className: string } {
    return resolveSourceBadge(sourceChannel, source);
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
      font-family: var(--vscode-font-family, sans-serif);
      font-size: var(--vscode-font-size, 13px);
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
      border: 3px solid rgba(148, 163, 184, 0.2);
      border-top: 3px solid #53c7de;
      border-radius: 50%;
      width: 34px;
      height: 34px;
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
    <p>Searching Git history and related AI sessions…</p>
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
      font-family: var(--vscode-font-family, sans-serif);
      font-size: var(--vscode-font-size, 13px);
      color: var(--vscode-foreground);
      background-color: var(--vscode-editor-background);
      padding: 24px;
    }
    .error-box {
      background-color: var(--vscode-inputValidation-errorBackground, rgba(239,68,68,0.1));
      border: 1px solid var(--vscode-inputValidation-errorBorder, #ef4444);
      padding: 16px;
      border-radius: 8px;
      margin-bottom: 16px;
    }
    button {
      background: #53c7de;
      color: #090f14;
      border: none;
      padding: 8px 16px;
      border-radius: 6px;
      cursor: pointer;
      font-weight: 600;
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

  private renderMatchCard(match: SnippetNoteMatch): string {
    const note = match.note;
    const relevance = match.relevance;
    const badge = this.getSourceBadge(note.sourceChannel, note.canonicalType);
    const isOrigin = relevance.isOriginMatch;
    const formattedDate = this.formatDate(note.date || note.createdAt);

    return `
      <div class="card ${isOrigin ? 'origin-match' : ''}" onclick="openNote('${this.escapeHtml(note.id)}')">
        <div class="card-header">
          <div class="badge ${badge.className}">${this.escapeHtml(badge.label)}</div>
          ${isOrigin ? '<div class="badge badge-origin">Direct Commit Origin</div>' : ''}
          <span class="card-date">${this.escapeHtml(formattedDate)}</span>
        </div>
        <h3 class="card-title">${this.escapeHtml(note.title || 'Untitled Note')}</h3>
        <p class="card-summary">${this.escapeHtml(note.summary || 'Click to view conversation details')}</p>
        ${relevance.reason ? `<div class="card-reason">${this.escapeHtml(relevance.reason)}</div>` : ''}
        <div class="card-footer">
          <span class="view-link">View session / note &rarr;</span>
        </div>
      </div>
    `;
  }

  private getMainHtml(response: SnippetNotesResponse, semanticNotes: any[] = []): string {
    const git = response.gitContext || this.input.gitInfo;
    const matches = response.matches || [];
    const hasGit = Boolean(git && git.commitHash);

    // 1. Linked Matches: Direct commit origin match or GitHub webhook notes
    const linkedMatches = matches.filter((m) => m.relevance.isOriginMatch || m.note.sourceChannel === 'github' || m.note.sourceChannel === 'git');
    const linkedIds = new Set(linkedMatches.map((m) => m.note.id));

    // 2. Direct File AI Sessions (non-origin)
    const directFileAiMatches = matches.filter((m) => !linkedIds.has(m.note.id));

    // 3. Semantic Vector AI Sessions (cross-file & conceptual matches)
    const allDirectIds = new Set(matches.map((m) => m.note.id));
    const semanticAiMatches: SnippetNoteMatch[] = semanticNotes
      .filter((n) => !allDirectIds.has(n.id))
      .map((n) => ({
        note: n,
        relevance: {
          score: 0.5,
          isOriginMatch: false,
          reason: 'Semantic vector match from related discussion',
        },
      }));

    // Combine & Deduplicate for Tab 2
    const seenIds = new Set<string>();
    const relatedMatches: SnippetNoteMatch[] = [];

    for (const m of [...directFileAiMatches, ...semanticAiMatches]) {
      if (!seenIds.has(m.note.id)) {
        seenIds.add(m.note.id);
        relatedMatches.push(m);
      }
    }

    // Sort chronologically newest to oldest
    relatedMatches.sort((a, b) => {
      const dateA = new Date(a.note.date || a.note.createdAt || 0).getTime();
      const dateB = new Date(b.note.date || b.note.createdAt || 0).getTime();
      return dateB - dateA;
    });

    const linkedHtml = linkedMatches.length > 0
      ? `<div class="timeline">${linkedMatches.map((m) => this.renderMatchCard(m)).join('')}</div>`
      : `<div class="empty-state">
          <p>No direct Git commit links attached to this snippet yet.</p>
          ${hasGit ? `<p style="font-size: 0.85em;">Origin recorded via Git commit history above.</p>` : ''}
        </div>`;

    const relatedHtml = relatedMatches.length > 0
      ? `<div class="timeline">${relatedMatches.map((m) => this.renderMatchCard(m)).join('')}</div>`
      : `<div class="empty-state">
          <p>No related AI chat sessions found for this snippet.</p>
        </div>`;

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
      --border: var(--vscode-widget-border, var(--vscode-panel-border, rgba(148, 163, 184, 0.14)));
      --card-bg: var(--vscode-editorWidget-background, rgba(15, 23, 29, 0.65));
      --card-hover: var(--vscode-list-hoverBackground, rgba(83, 199, 222, 0.08));
      --accent: #53c7de;
      --accent-soft: rgba(83, 199, 222, 0.12);
      --desc: var(--vscode-descriptionForeground, #8da0ae);
      --radius: 8px;
    }

    * { box-sizing: border-box; }

    body {
      font-family: var(--vscode-font-family, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif);
      font-size: var(--vscode-font-size, 13px);
      color: var(--fg);
      background-color: var(--bg);
      padding: 20px;
      margin: 0;
      line-height: 1.6;
    }

    .header {
      margin-bottom: 16px;
      padding-bottom: 14px;
      border-bottom: 1px solid var(--border);
    }

    .title-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
    }

    .main-title {
      font-size: 1.25em;
      font-weight: 600;
      margin: 0;
      color: var(--fg);
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .main-title .icon-accent {
      color: var(--accent);
    }

    .file-path {
      font-size: 0.88em;
      color: var(--desc);
      font-family: var(--vscode-editor-font-family, monospace);
      margin-top: 4px;
    }

    /* Git Context Card */
    .git-card {
      background: var(--card-bg);
      border: 1px solid var(--border);
      border-left: 3px solid var(--accent);
      border-radius: var(--radius);
      padding: 12px 16px;
      margin: 16px 0;
    }

    .git-card-title {
      font-size: 0.8em;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      color: var(--accent);
      margin-bottom: 6px;
      display: flex;
      align-items: center;
      gap: 6px;
    }

    .git-info-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
      gap: 8px;
      font-size: 0.88em;
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

    /* Code Snippet Box */
    .snippet-card {
      background: var(--bg);
      border: 1px solid var(--border);
      border-radius: var(--radius);
      margin: 16px 0;
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
      font-size: 0.88em;
      overflow-x: auto;
      white-space: pre;
    }

    /* Tabs Header */
    .tabs-header {
      display: flex;
      gap: 8px;
      border-bottom: 1px solid var(--border);
      margin: 20px 0 16px 0;
    }

    .tab-btn {
      background: none;
      border: none;
      border-bottom: 2px solid transparent;
      color: var(--desc);
      padding: 8px 16px;
      cursor: pointer;
      font-size: 0.9em;
      font-weight: 500;
      display: flex;
      align-items: center;
      gap: 6px;
      transition: all 0.2s ease;
    }

    .tab-btn:hover {
      color: var(--fg);
      background: rgba(148, 163, 184, 0.05);
      border-radius: 4px 4px 0 0;
    }

    .tab-btn.active {
      color: var(--accent);
      border-bottom-color: var(--accent);
      font-weight: 600;
    }

    .tab-count {
      background: var(--accent-soft);
      color: var(--accent);
      font-size: 0.78em;
      padding: 2px 7px;
      border-radius: 10px;
      font-weight: 600;
    }

    .tab-content {
      display: none;
    }

    .tab-content.active {
      display: block;
    }

    /* Cards & Timeline */
    .timeline {
      display: flex;
      flex-direction: column;
      gap: 12px;
    }

    .card {
      background: var(--card-bg);
      border: 1px solid var(--border);
      border-radius: var(--radius);
      padding: 14px 16px;
      cursor: pointer;
      transition: all 0.2s ease;
    }

    .card:hover {
      background: var(--card-hover);
      border-color: var(--accent);
      transform: translateY(-1px);
    }

    .card.origin-match {
      border-left: 3px solid #7dd3a5;
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
      font-size: 1em;
      font-weight: 600;
      color: var(--fg);
    }

    .card-summary {
      margin: 0 0 8px;
      font-size: 0.88em;
      color: var(--desc);
    }

    .card-reason {
      font-size: 0.78em;
      color: var(--accent);
      background: var(--accent-soft);
      padding: 3px 8px;
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
      background: rgba(148, 163, 184, 0.1);
      color: var(--fg);
    }

    .badge-claude { background: rgba(245, 158, 11, 0.15); color: #f59e0b; }
    .badge-antigravity { background: rgba(83, 199, 222, 0.15); color: #53c7de; }
    .badge-codex { background: rgba(125, 211, 165, 0.15); color: #7dd3a5; }
    .badge-opencode { background: rgba(192, 132, 252, 0.15); color: #c084fc; }
    .badge-origin { background: rgba(125, 211, 165, 0.18); color: #7dd3a5; font-weight: 600; }
    .badge-git { background: rgba(137, 87, 229, 0.15); color: #a78bfa; }

    /* Empty state */
    .empty-state {
      background: var(--card-bg);
      border: 1px dashed var(--border);
      border-radius: var(--radius);
      padding: 24px;
      text-align: center;
      color: var(--desc);
      margin-top: 12px;
    }

    .btn {
      background: var(--card-bg);
      color: var(--fg);
      border: 1px solid var(--border);
      padding: 5px 12px;
      border-radius: 4px;
      cursor: pointer;
      font-size: 0.82em;
      transition: all 0.2s ease;
    }
    .btn:hover {
      background: var(--card-hover);
      border-color: var(--accent);
    }
  </style>
</head>
<body>
  <div class="header">
    <div class="title-row">
      <h1 class="main-title">Code Origin</h1>
      <button class="btn" onclick="copySnippet()">Copy Snippet</button>
    </div>
    <div class="file-path">${this.escapeHtml(this.input.filePath)} (Lines ${this.input.startLine}–${this.input.endLine})</div>
  </div>

  ${hasGit ? `
  <div class="git-card">
    <div class="git-card-title">Git Commit Origin</div>
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

  <!-- Tabs Navigation -->
  <div class="tabs-header">
    <button class="tab-btn active" onclick="switchTab('linkedTab', this)">
      <span>Linked Notes</span>
      <span class="tab-count">${linkedMatches.length}</span>
    </button>
    <button class="tab-btn" onclick="switchTab('relatedTab', this)">
      <span>Related AI Sessions</span>
      <span class="tab-count">${relatedMatches.length}</span>
    </button>
  </div>

  <!-- Tab Contents -->
  <div id="linkedTab" class="tab-content active">
    ${linkedHtml}
  </div>

  <div id="relatedTab" class="tab-content">
    ${relatedHtml}
  </div>

  <script>
    const vscode = acquireVsCodeApi();

    function openNote(noteId) {
      vscode.postMessage({ command: 'openNote', noteId });
    }

    function copySnippet() {
      vscode.postMessage({ command: 'copyText', text: ${JSON.stringify(this.input.snippet)} });
    }

    function switchTab(tabId, btn) {
      document.querySelectorAll('.tab-content').forEach(el => el.classList.remove('active'));
      document.querySelectorAll('.tab-btn').forEach(el => el.classList.remove('active'));
      document.getElementById(tabId).classList.add('active');
      btn.classList.add('active');
    }
  </script>
</body>
</html>`;
  }
}
