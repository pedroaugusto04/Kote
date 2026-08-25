import * as vscode from 'vscode';
import type { KbClient } from '../kb-client';
import type { SnippetNoteMatch, SnippetNotesResponse } from '../types';
import type { GitSnippetOriginInfo } from '../utils/git-blame';
import { GIT_SOURCE_CHANNELS, resolveSourceBadge } from '../utils/source-channel';
import { NoteDetailWebviewProvider } from './note-detail-webview.provider';
import { KOTE_WEBVIEW_FOUNDATION_STYLES } from './kote-webview-design';

const LINEAGE_RELEVANCE_THRESHOLDS = {
  sameFileContent: 0.65,
  semanticSimilarity: 0.62,
} as const;

const MAX_RELATED_COMMITS = 20;

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
      SnippetOriginSummaryProvider.outputChannel = vscode.window.createOutputChannel('Kote Code Lineage');
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
      `Kote Code Lineage: ${input.filePath}:${input.startLine}-${input.endLine}`,
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
        limit: 50,
      }, { signal });

      if (signal.aborted) return;

      const directIds = (response.matches || []).map((m) => m.note.id);

      // Pass full selected code snippet block (capped at 1,000 chars) for semantic AI search
      const snippetQuery = (this.input.snippet || '').trim().slice(0, 1000);

      // Hybrid fetch: retrieve cross-file semantic matches, excluding all direct file matches.
      let semanticNotes: any[] = [];
      try {
        semanticNotes = await this.kbClient.findRelatedNotesByFile(
          this.input.filePath,
          directIds,
          {
            projectSlug: this.input.projectSlug,
            query: snippetQuery,
            limit: 10,
            searchProfile: 'snippet',
            signal,
          }
        );
      } catch (e) {
        // Best-effort semantic search fallback
      }

      if (signal.aborted) return;
      this.panel.webview.html = this.getMainHtml(response, semanticNotes);
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
    <p>Searching Git history and related notes…</p>
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
    <strong>Failed to load Kote Code Lineage</strong>
    <p>${this.escapeHtml(errorMsg)}</p>
  </div>
  <button onclick="acquireVsCodeApi().postMessage({ command: 'refresh' })">Try Again</button>
</body>
</html>`;
  }

  private truncateText(text?: string, maxLength: number = 220): string {
    if (!text || typeof text !== 'string') return '';
    const cleaned = text.replace(/\s+/g, ' ').trim();
    if (cleaned.length <= maxLength) return cleaned;
    return cleaned.substring(0, maxLength).trim() + '…';
  }

  private renderMatchCard(match: SnippetNoteMatch): string {
    const note = match.note;
    const relevance = match.relevance;
    const badge = this.getSourceBadge(note.sourceChannel, note.canonicalType);
    const isOrigin = relevance.isOriginMatch;
    const formattedDate = this.formatDate(note.date || note.createdAt);
    const summaryText = this.truncateText(note.summary || 'Click to view conversation details', 220);

    return `
      <div class="card ${isOrigin ? 'origin-match' : ''}" onclick="openNote('${this.escapeHtml(note.id)}')">
        <div class="card-header">
          <div class="badge ${badge.className}">${this.escapeHtml(badge.label)}</div>
          ${isOrigin ? '<div class="badge badge-origin">Exact commit match</div>' : ''}
          <span class="card-date">${this.escapeHtml(formattedDate)}</span>
        </div>
        <h3 class="card-title">${this.escapeHtml(this.truncateText(note.title || 'Untitled Note', 90))}</h3>
        <p class="card-summary">${this.escapeHtml(summaryText)}</p>
        ${relevance.reason ? `<div class="card-reason">${this.escapeHtml(relevance.reason)}</div>` : ''}
        <div class="card-footer">
          <span class="view-link">View note &rarr;</span>
        </div>
      </div>
    `;
  }

  private renderCollapsibleMatches(
    sectionId: string,
    matches: SnippetNoteMatch[],
    previewLimit: number,
    emptyState: string,
  ): string {
    if (matches.length === 0) return emptyState;

    const preview = matches.slice(0, previewLimit);
    const remaining = matches.slice(previewLimit);

    return `
      <div class="timeline">
        ${preview.map((match) => this.renderMatchCard(match)).join('')}
        ${remaining.length > 0 ? `
          <div id="${sectionId}-more" class="additional-results">
            ${remaining.map((match) => this.renderMatchCard(match)).join('')}
          </div>
          <button class="show-more-btn" data-label="Show ${remaining.length} more" onclick="toggleMore('#${sectionId}-more', this)">Show ${remaining.length} more</button>
        ` : ''}
      </div>
    `;
  }

  private getMainHtml(response: SnippetNotesResponse, semanticNotes: any[] = []): string {
    const git = response.gitContext || this.input.gitInfo;
    const matches = response.matches || [];
    const hasGit = Boolean(git && git.commitHash);

    // 1. Related commits are factual file links. They remain visible regardless
    // of age, while selected-code overlap determines their order.
    const isGitChannel = (channel?: string) => GIT_SOURCE_CHANNELS.some((g) => (channel || '').toLowerCase().includes(g));
    const rawLinkedMatches = matches.filter((m) => (
      m.relevance.isOriginMatch || isGitChannel(m.note.sourceChannel)
    ));

    // Exact commit hashes first, then selected-code overlap, then newest date.
    rawLinkedMatches.sort((a, b) => {
      if (a.relevance.isOriginMatch !== b.relevance.isOriginMatch) {
        return a.relevance.isOriginMatch ? -1 : 1;
      }
      const contentScoreA = a.relevance?.contentScore ?? 0;
      const contentScoreB = b.relevance?.contentScore ?? 0;
      if (contentScoreB !== contentScoreA) {
        return contentScoreB - contentScoreA;
      }
      const dateA = new Date(a.note.date || a.note.createdAt || 0).getTime();
      const dateB = new Date(b.note.date || b.note.createdAt || 0).getTime();
      return dateB - dateA;
    });
    const linkedMatches = rawLinkedMatches.slice(0, MAX_RELATED_COMMITS);
    const linkedIds = new Set(rawLinkedMatches.map((m) => m.note.id));

    // 2. File notes need selected-code overlap; their date does not determine relevance.
    const directFileMatches = matches.filter((m) => (
      !linkedIds.has(m.note.id)
      && m.relevance.contentScore >= LINEAGE_RELEVANCE_THRESHOLDS.sameFileContent
    ));

    // 3. Cross-file notes need a calibrated vector similarity, rather than an RRF rank.
    const allDirectIds = new Set(matches.map((m) => m.note.id));
    const semanticMatches: SnippetNoteMatch[] = semanticNotes
      .filter((n) => (
        !allDirectIds.has(n.id)
        && typeof n.semanticSimilarity === 'number'
        && n.semanticSimilarity >= LINEAGE_RELEVANCE_THRESHOLDS.semanticSimilarity
      ))
      .map((n) => ({
        note: n,
        relevance: {
          score: n.semanticSimilarity,
          contentScore: n.semanticSimilarity,
          isOriginMatch: false,
          reason: 'Semantic vector match from related discussion',
        },
      }));

    // Combine & Deduplicate for Tab 2
    const seenIds = new Set<string>();
    const allRelatedMatches: SnippetNoteMatch[] = [];

    for (const m of [...directFileMatches, ...semanticMatches]) {
      if (!seenIds.has(m.note.id)) {
        seenIds.add(m.note.id);
        allRelatedMatches.push(m);
      }
    }

    // Sort by relevance score DESC, tie-break by date newest to oldest
    allRelatedMatches.sort((a, b) => {
      const scoreA = a.relevance?.score ?? 0;
      const scoreB = b.relevance?.score ?? 0;
      if (scoreB !== scoreA) {
        return scoreB - scoreA;
      }
      const dateA = new Date(a.note.date || a.note.createdAt || 0).getTime();
      const dateB = new Date(b.note.date || b.note.createdAt || 0).getTime();
      return dateB - dateA;
    });

    const relatedMatches = allRelatedMatches;

    // 4. Unified Snippet Evolution Timeline (chronologically newest to oldest)
    type TimelineEntry = {
      date: string;
      title: string;
      description: string;
      noteId?: string;
      badge: { label: string; className: string };
      isCommit?: boolean;
      isOrigin?: boolean;
    };

    const timelineItems: TimelineEntry[] = [];

    // Add Git Commit if available
    if (hasGit && git?.commitDate) {
      timelineItems.push({
        date: git.commitDate,
        title: `Latest line change: ${git.commitHash ? git.commitHash.slice(0, 7) : ''} (${git.author || 'Unknown'})`,
        description: git.commitMessage || 'No commit message',
        badge: { label: 'Git Commit', className: 'badge-git' },
        isCommit: true,
      });
    }

    // Timeline presents commit evidence only. Related notes stay in their tab.
    for (const match of linkedMatches) {
      const note = match.note;
      const badge = this.getSourceBadge(note.sourceChannel, note.canonicalType);
      const isOrigin = match.relevance?.isOriginMatch;
      const rawText = typeof (note.metadata as Record<string, unknown> | undefined)?.rawText === 'string'
        ? String(note.metadata?.rawText)
        : '';
      timelineItems.push({
        date: note.date || note.createdAt || '',
        title: note.title || 'Untitled Note',
        description: note.summary || rawText || note.content || 'No description',
        noteId: note.id,
        badge,
        isOrigin,
      });
    }

    // Sort timeline chronologically: newest to oldest
    timelineItems.sort((a, b) => {
      const timeA = new Date(a.date).getTime() || 0;
      const timeB = new Date(b.date).getTime() || 0;
      return timeB - timeA;
    });

    const renderedTimelineHtml = timelineItems.length > 0
      ? `
        <div class="timeline-section">
          <div class="timeline-section-header">
            <h2 class="timeline-heading">Timeline</h2>
            <div class="timeline-controls">
              <span class="timeline-count">${timelineItems.length} ${timelineItems.length === 1 ? 'event' : 'events'}</span>
              <button class="show-more-btn" data-label="Show timeline" onclick="toggleSection('lineage-timeline', this)">Show timeline</button>
            </div>
          </div>
          <div id="lineage-timeline" class="vertical-timeline collapsible-section">
            ${timelineItems.map((item, index) => `
              <div class="vertical-timeline-item ${item.isCommit ? 'timeline-commit' : ''} ${item.isOrigin ? 'timeline-origin' : ''} ${item.noteId ? 'clickable' : ''} ${index >= 8 ? 'timeline-extra' : ''}" ${item.noteId ? `onclick="openNote('${this.escapeHtml(item.noteId)}')"` : ''}>
                <div class="timeline-item-header">
                  <span class="vertical-timeline-date">${this.escapeHtml(this.formatDate(item.date))}</span>
                  <div class="badge ${item.badge.className}">${this.escapeHtml(item.badge.label)}</div>
                  ${item.isOrigin ? '<span class="badge badge-origin">Exact commit match</span>' : ''}
                </div>
                <div class="vertical-timeline-title">
                  <span>${this.escapeHtml(this.truncateText(item.title, 90))}</span>
                  ${item.noteId ? `<span class="timeline-link">View note →</span>` : ''}
                </div>
                <div class="vertical-timeline-description">${this.escapeHtml(this.truncateText(item.description, 220))}</div>
              </div>
            `).join('')}
            ${timelineItems.length > 8 ? `<button class="show-more-btn" data-label="Show ${timelineItems.length - 8} more" onclick="toggleMore('.timeline-extra', this)">Show ${timelineItems.length - 8} more</button>` : ''}
          </div>
        </div>
      `
      : '';

    const linkedHtml = this.renderCollapsibleMatches(
      'linked-notes',
      linkedMatches,
      3,
      `<div class="empty-state">
          <p>No commits linked to this file were found.</p>
          ${hasGit ? `<p style="font-size: 0.85em;">Git history is shown above.</p>` : ''}
        </div>`,
    );

    const relatedHtml = this.renderCollapsibleMatches(
      'related-notes',
      relatedMatches,
      5,
      `<div class="empty-state">
          <p>No high-confidence related notes found for this snippet.</p>
        </div>`,
    );

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline';">
  <style>
    ${KOTE_WEBVIEW_FOUNDATION_STYLES}

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

    .additional-results,
    .timeline-extra {
      display: none;
    }

    .additional-results.is-expanded {
      display: contents;
    }

    .timeline-extra.is-expanded {
      display: block;
    }

    .show-more-btn {
      align-self: flex-start;
      background: transparent;
      color: var(--accent);
      border: 1px solid var(--border);
      border-radius: 5px;
      cursor: pointer;
      font-size: 0.85em;
      font-weight: 600;
      margin-top: 2px;
      padding: 6px 10px;
    }

    .show-more-btn:hover {
      background: var(--accent-soft);
      border-color: var(--accent);
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
      display: -webkit-box;
      -webkit-line-clamp: 3;
      -webkit-box-orient: vertical;
      overflow: hidden;
      text-overflow: ellipsis;
      line-height: 1.4;
      max-height: 4.2em;
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

    /* Vertical Timeline Section */
    .timeline-section {
      margin: 20px 0 16px 0;
      background: var(--card-bg);
      border: 1px solid var(--border);
      border-radius: var(--radius);
      padding: 16px 18px;
    }

    .timeline-section-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 16px;
      padding-bottom: 10px;
      border-bottom: 1px solid var(--border);
    }

    .timeline-heading {
      font-size: 1.05em;
      font-weight: 600;
      margin: 0;
      color: var(--fg);
      display: flex;
      align-items: center;
      gap: 6px;
    }

    .timeline-count {
      font-size: 0.8em;
      color: var(--desc);
    }

    .timeline-controls {
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .vertical-timeline {
      display: flex;
      flex-direction: column;
      position: relative;
    }

    .collapsible-section {
      display: none;
    }

    .collapsible-section.is-expanded {
      display: flex;
    }

    .vertical-timeline-item {
      border-left: 2px solid var(--border);
      padding-left: 18px;
      padding-bottom: 16px;
      margin-bottom: 0;
      position: relative;
      transition: border-left-color 0.2s;
    }

    .vertical-timeline-item:last-child {
      border-left-color: transparent;
      padding-bottom: 4px;
    }

    .vertical-timeline-item.clickable {
      cursor: pointer;
    }

    .vertical-timeline-item:hover {
      border-left-color: var(--accent);
    }

    .vertical-timeline-item::before {
      content: '';
      position: absolute;
      left: -6px;
      top: 4px;
      width: 10px;
      height: 10px;
      border-radius: 50%;
      background-color: var(--accent);
      border: 2px solid var(--bg);
    }

    .vertical-timeline-item.timeline-commit::before {
      background-color: #a78bfa;
    }

    .vertical-timeline-item.timeline-origin::before {
      background-color: #7dd3a5;
    }

    .timeline-item-header {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-bottom: 4px;
      flex-wrap: wrap;
    }

    .vertical-timeline-date {
      font-size: 0.8em;
      color: var(--desc);
    }

    .vertical-timeline-title {
      font-weight: 600;
      font-size: 0.95em;
      color: var(--fg);
      margin-bottom: 4px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 8px;
    }

    .vertical-timeline-description {
      color: var(--desc);
      font-size: 0.86em;
      line-height: 1.45;
    }

    .timeline-link {
      font-size: 0.82em;
      color: var(--accent);
      text-decoration: none;
      font-weight: 500;
      white-space: nowrap;
    }

    .vertical-timeline-item:hover .timeline-link {
      text-decoration: underline;
    }

    /* Lineage-specific badges */
    .badge-origin { background: rgba(125, 211, 165, 0.18); color: #7dd3a5; font-weight: 600; }

  </style>
</head>
<body>
  <div class="header">
    <div class="title-row">
      <h1 class="main-title">Kote Code Lineage</h1>
      <button class="btn" onclick="copySnippet()">Copy Snippet</button>
    </div>
    <div class="file-path">${this.escapeHtml(this.input.filePath)} (Lines ${this.input.startLine}–${this.input.endLine})</div>
  </div>

  <div class="snippet-card">
    <div class="snippet-header">
      <span>Inspected Code Snippet</span>
    </div>
    <pre class="snippet-code"><code>${this.escapeHtml(this.input.snippet)}</code></pre>
  </div>

  ${renderedTimelineHtml}

  <!-- Tabs Navigation -->
  <div class="tabs-header">
    <button class="tab-btn active" onclick="switchTab('linkedTab', this)">
      <span>Related Commits</span>
      <span class="tab-count">${linkedMatches.length}</span>
    </button>
    <button class="tab-btn" onclick="switchTab('relatedTab', this)">
      <span>Related Notes</span>
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

    function toggleMore(selector, button) {
      const elements = Array.from(document.querySelectorAll(selector));
      const expanded = !elements.some(element => element.classList.contains('is-expanded'));
      elements.forEach(element => element.classList.toggle('is-expanded', expanded));
      button.textContent = expanded ? 'Show less' : button.dataset.label;
    }

    function toggleSection(id, button) {
      const section = document.getElementById(id);
      const expanded = !section.classList.contains('is-expanded');
      section.classList.toggle('is-expanded', expanded);
      button.textContent = expanded ? 'Hide timeline' : button.dataset.label;
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
