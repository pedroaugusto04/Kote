import * as vscode from 'vscode';
import type { KbClient } from '../kb-client';
import { isConfigured } from '../kb-client';
import type { GitSnippetOriginInfo } from '../utils/git-blame';
import { extractGitSnippetOrigin } from '../utils/git-blame';
import type { SnippetNoteMatch } from '../types';
import { EXTENSION_COMMANDS } from '../constants';
import { logInfo } from '../error-reporter';
import { resolveSourceBadge } from '../utils/source-channel';
import { collapseWhitespace } from '../utils/text';

interface CachedLineBlame {
  commit: GitSnippetOriginInfo | null;
}

interface ActiveContext {
  line: number;
  commit: GitSnippetOriginInfo | null;
  bestMatch: SnippetNoteMatch | null;
  allMatches: SnippetNoteMatch[];
  formattedText: string;
}

export class LineContextProvider implements vscode.HoverProvider, vscode.Disposable {
  private readonly decorationType: vscode.TextEditorDecorationType;
  private readonly disposables: vscode.Disposable[] = [];
  private debounceTimer: NodeJS.Timeout | null = null;
  private abortController: AbortController | null = null;

  // Cache: filePath -> (lineNumber -> CachedLineBlame)
  private readonly blameCache = new Map<string, Map<number, CachedLineBlame>>();

  // Cache: commitHash -> SnippetNoteMatch[]
  private readonly commitNotesCache = new Map<string, { matches: SnippetNoteMatch[]; timestamp: number }>();

  // In-flight request deduplication: commitHash -> Promise<SnippetNoteMatch[]>
  private readonly inFlightCommitRequests = new Map<string, Promise<SnippetNoteMatch[]>>();

  // Currently displayed context per document URI
  private readonly activeContextPerDocument = new Map<string, ActiveContext>();

  // Last evaluated line per editor to avoid redundant fetches
  private lastEvaluatedLinePerEditor = new WeakMap<vscode.TextEditor, number>();

  constructor(
    private readonly kbClient: KbClient,
    private readonly getProjectSlug: () => string,
  ) {
    this.decorationType = vscode.window.createTextEditorDecorationType({
      after: {
        margin: '0 0 0 2.5em',
        color: new vscode.ThemeColor('editorCodeLens.foreground'),
        fontStyle: 'italic',
      },
      rangeBehavior: vscode.DecorationRangeBehavior.ClosedOpen,
    });

    this.disposables.push(
      this.decorationType,
      vscode.window.onDidChangeActiveTextEditor((editor) => {
        if (editor) {
          this.triggerUpdate(editor);
        }
      }),
      vscode.window.onDidChangeTextEditorSelection((e) => {
        if (e.textEditor === vscode.window.activeTextEditor) {
          this.triggerUpdate(e.textEditor);
        }
      }),
      vscode.workspace.onDidChangeTextDocument((e) => {
        // Invalidate cache for modified document
        const filePath = vscode.workspace.asRelativePath(e.document.uri);
        this.blameCache.delete(filePath);
      }),
      vscode.workspace.onDidChangeConfiguration((e) => {
        if (e.affectsConfiguration('kote.inlineAnnotations')) {
          const editor = vscode.window.activeTextEditor;
          if (editor) {
            this.clearDecoration(editor);
            this.triggerUpdate(editor);
          }
        }
      }),
    );

    // Initial check for currently active editor
    if (vscode.window.activeTextEditor) {
      this.triggerUpdate(vscode.window.activeTextEditor);
    }
  }

  private isEnabled(): boolean {
    const config = vscode.workspace.getConfiguration('kote.inlineAnnotations');
    return config.get<boolean>('enabled', true);
  }

  private isHoverEnabled(): boolean {
    const config = vscode.workspace.getConfiguration('kote.inlineAnnotations');
    return config.get<boolean>('showHover', true);
  }

  private getDebounceMs(): number {
    const config = vscode.workspace.getConfiguration('kote.inlineAnnotations');
    return config.get<number>('debounceMs', 500);
  }

  private triggerUpdate(editor: vscode.TextEditor): void {
    if (!this.isEnabled() || !isConfigured()) {
      this.clearDecoration(editor);
      return;
    }

    if (editor.document.uri.scheme !== 'file' || editor.document.isUntitled) {
      this.clearDecoration(editor);
      return;
    }

    const currentLine = editor.selection.active.line + 1; // 1-indexed
    const lastLine = this.lastEvaluatedLinePerEditor.get(editor);

    if (lastLine === currentLine) {
      return;
    }

    // Immediately clear previous decoration while debouncing new line
    this.clearDecoration(editor);

    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }

    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }

    const delay = this.getDebounceMs();
    this.debounceTimer = setTimeout(() => {
      this.lastEvaluatedLinePerEditor.set(editor, currentLine);
      void this.updateContextForLine(editor, currentLine);
    }, delay);
  }

  private clearDecoration(editor: vscode.TextEditor): void {
    editor.setDecorations(this.decorationType, []);
    this.activeContextPerDocument.delete(editor.document.uri.toString());
  }

  private async updateContextForLine(editor: vscode.TextEditor, line: number): Promise<void> {
    const document = editor.document;
    const docUriStr = document.uri.toString();

    this.abortController = new AbortController();
    const signal = this.abortController.signal;

    const ctx = await this.resolveContextForLine(document, line, signal);

    if (signal.aborted) return;

    // Check if user moved away from this line while fetching
    if (editor.selection.active.line + 1 !== line) {
      return;
    }

    if (!ctx || !ctx.formattedText) {
      this.clearDecoration(editor);
      return;
    }

    // Save active context for hover provider
    this.activeContextPerDocument.set(docUriStr, ctx);

    // Apply inline decoration at end of line
    const lineRange = document.lineAt(line - 1).range;
    const decoration = {
      range: new vscode.Range(lineRange.end, lineRange.end),
      renderOptions: {
        after: {
          contentText: `  ${ctx.formattedText}`,
        },
      },
    };

    editor.setDecorations(this.decorationType, [decoration]);
  }

  private async resolveContextForLine(
    document: vscode.TextDocument,
    line: number,
    signal?: AbortSignal,
  ): Promise<ActiveContext | null> {
    // Check if line is empty or purely whitespace
    if (line > document.lineCount) return null;
    const lineText = document.lineAt(line - 1).text.trim();
    if (!lineText) return null;

    const workspaceFolder = vscode.workspace.getWorkspaceFolder(document.uri);
    if (!workspaceFolder) return null;

    const workspaceRoot = workspaceFolder.uri.fsPath;
    const relativePath = vscode.workspace.asRelativePath(document.uri);

    // 1. Fetch Git Blame (using cache if available)
    let fileCache = this.blameCache.get(relativePath);
    if (!fileCache) {
      fileCache = new Map<number, CachedLineBlame>();
      this.blameCache.set(relativePath, fileCache);
    }

    let lineBlame = fileCache.get(line);
    if (!lineBlame) {
      const gitInfo = await extractGitSnippetOrigin(workspaceRoot, relativePath, line, line);
      lineBlame = { commit: gitInfo };
      fileCache.set(line, lineBlame);
    }

    const gitCommit = lineBlame.commit;
    if (!gitCommit || !gitCommit.commitHash || gitCommit.commitHash.startsWith('00000000')) {
      return null;
    }

    // Extract enclosing context window (3 lines before and 3 lines after, up to 7 lines)
    const startCtxLine = Math.max(0, line - 4);
    const endCtxLine = Math.min(document.lineCount - 1, line + 2);
    const ctxRange = new vscode.Range(
      startCtxLine,
      0,
      endCtxLine,
      document.lineAt(endCtxLine).range.end.character,
    );
    const codeSnippet = document.getText(ctxRange).trim() || lineText;

    // 2. Fetch Kote Notes for this commit / line
    let matches: SnippetNoteMatch[];
    const commitHash = gitCommit.commitHash;
    const cachedNotes = this.commitNotesCache.get(commitHash);
    const now = Date.now();

    // Cache valid for 5 minutes
    if (cachedNotes && now - cachedNotes.timestamp < 300_000) {
      matches = cachedNotes.matches;
    } else if (this.inFlightCommitRequests.has(commitHash)) {
      // Re-use currently in-flight request for this commit hash to avoid duplicate calls
      matches = (await this.inFlightCommitRequests.get(commitHash)) || [];
    } else {
      const fetchPromise = (async () => {
        try {
          const response = await this.kbClient.findNotesBySnippet(
            {
              filePath: relativePath,
              codeSnippet,
              commitHash: gitCommit.commitHash,
              commitHashes: gitCommit.commits?.map((c) => c.commitHash) || [gitCommit.commitHash],
              commitDate: gitCommit.commitDate,
              author: gitCommit.author,
              commitMessage: gitCommit.commitMessage,
              projectSlug: this.getProjectSlug(),
              limit: 5,
            },
            { signal },
          );

          if (signal?.aborted) return [];
          const resMatches = response.matches || [];
          this.commitNotesCache.set(commitHash, { matches: resMatches, timestamp: Date.now() });
          return resMatches;
        } catch {
          logInfo('LineContext', `Failed to find notes for snippet at ${relativePath}:${line}`);
          return [];
        } finally {
          this.inFlightCommitRequests.delete(commitHash);
        }
      })();

      this.inFlightCommitRequests.set(commitHash, fetchPromise);
      matches = await fetchPromise;
    }

    if (signal?.aborted) return null;

    const bestMatch = matches.length > 0 ? matches[0] : null;
    const formatted = this.formatInlineText(gitCommit, bestMatch, matches.length);

    return {
      line,
      commit: gitCommit,
      bestMatch,
      allMatches: matches,
      formattedText: formatted,
    };
  }

  private formatInlineText(
    gitCommit: GitSnippetOriginInfo,
    bestMatch: SnippetNoteMatch | null,
    totalMatches = 0,
  ): string {
    const timeAgo = this.formatRelativeTime(gitCommit.commitDate);
    const extraCountSuffix = totalMatches > 1 ? ` (+${totalMatches - 1})` : '';

    if (bestMatch?.note) {
      const note = bestMatch.note;
      const source = this.formatSourceLabel(note.sourceChannel, note.metadata);
      const decisionOrTitle = this.extractShortSummary(note);
      if (decisionOrTitle) {
        return `Kote: ${source} (${timeAgo}) - ${decisionOrTitle}${extraCountSuffix}`;
      }
      return `Kote: ${source} (${timeAgo})${extraCountSuffix}`;
    }

    // If no note found, fallback to commit summary if recent or relevant
    if (gitCommit.commitMessage) {
      const cleanMsg = gitCommit.commitMessage.split('\n')[0].trim();
      const author = gitCommit.author ? `${gitCommit.author}, ` : '';
      return `Kote: ${author}${timeAgo} - ${this.truncate(cleanMsg, 45)}`;
    }

    return '';
  }

  private formatSourceLabel(sourceChannel?: string, metadata?: Record<string, unknown>): string {
    const provider = typeof metadata?.provider === 'string' ? metadata.provider : undefined;
    return resolveSourceBadge(provider || sourceChannel, sourceChannel).label;
  }

  private extractShortSummary(note: { title?: string; summary?: string; metadata?: Record<string, unknown> }): string {
    if (note.title && !note.title.toLowerCase().startsWith('ai chat session') && !note.title.toLowerCase().startsWith('session handoff')) {
      return this.truncate(note.title, 45);
    }
    if (note.summary) {
      const firstSentence = note.summary.split(/[.\n]/)[0].trim();
      if (firstSentence) return this.truncate(firstSentence, 45);
    }
    return '';
  }

  private formatRelativeTime(dateStr?: string): string {
    if (!dateStr) return '';
    try {
      const diffMs = Date.now() - new Date(dateStr).getTime();
      const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
      if (diffDays <= 0) {
        const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
        return diffHours <= 0 ? 'just now' : `${diffHours}h ago`;
      }
      if (diffDays === 1) return 'yesterday';
      if (diffDays < 30) return `${diffDays}d ago`;
      const diffMonths = Math.floor(diffDays / 30);
      return `${diffMonths}mo ago`;
    } catch {
      return '';
    }
  }

  private truncate(str: string, maxLen: number): string {
    const clean = collapseWhitespace(str);
    if (clean.length <= maxLen) return clean;
    return `${clean.slice(0, maxLen - 1)}...`;
  }

  // -------------------------------------------------------------------------
  // Hover Provider implementation
  // -------------------------------------------------------------------------
  async provideHover(
    document: vscode.TextDocument,
    position: vscode.Position,
    _token: vscode.CancellationToken,
  ): Promise<vscode.Hover | null> {
    if (!this.isEnabled() || !this.isHoverEnabled() || !isConfigured()) {
      return null;
    }

    const docUriStr = document.uri.toString();
    const activeContext = this.activeContextPerDocument.get(docUriStr);
    const targetLine = position.line + 1;

    // Only open the card if hovering over the active line that has the annotation
    if (!activeContext || activeContext.line !== targetLine || !activeContext.commit) {
      return null;
    }

    // Only trigger when hovering at or past the end of the code line (where the inline annotation lives)
    const lineEndCharacter = document.lineAt(position.line).text.length;
    if (position.character < lineEndCharacter) {
      return null;
    }

    const { commit, bestMatch } = activeContext;

    const md = new vscode.MarkdownString();
    md.isTrusted = true;
    md.supportHtml = false;

    md.appendMarkdown(`### Kote Context\n\n`);

    if (bestMatch?.note) {
      const note = bestMatch.note;
      const source = this.formatSourceLabel(note.sourceChannel, note.metadata);
      const time = this.formatRelativeTime(commit.commitDate);

      md.appendMarkdown(`**Source:** ${source} *(${time})*\n\n`);

      if (commit.commitHash) {
        const shortHash = commit.commitHash.substring(0, 7);
        const author = commit.author || 'Author';
        const msg = commit.commitMessage ? ` - *${commit.commitMessage.split('\n')[0]}*` : '';
        md.appendMarkdown(`**Commit:** \`${shortHash}\` by ${author}${msg}\n\n`);
      }

      if (note.title) {
        md.appendMarkdown(`**Title:** ${note.title}\n\n`);
      }

      const summaryText = note.summary || note.content;
      if (summaryText) {
        const cleanSummary = summaryText.slice(0, 300).trim();
        md.appendMarkdown(`**Decision / Context:**\n${cleanSummary}${summaryText.length > 300 ? '...' : ''}\n\n`);
      }

      const encodedNoteArg = encodeURIComponent(JSON.stringify([note.id]));
      md.appendMarkdown(`[View Note](command:${EXTENSION_COMMANDS.OPEN_NOTE_DETAIL}?${encodedNoteArg}) | `);
      md.appendMarkdown(`[Explain Origin Lineage](command:${EXTENSION_COMMANDS.EXPLAIN_SNIPPET_ORIGIN})\n\n`);

      // If multiple notes were matched for this line/commit, display them neatly
      const otherMatches = activeContext.allMatches.slice(1);
      if (otherMatches.length > 0) {
        md.appendMarkdown(`---\n\n`);
        md.appendMarkdown(`**Other Related Notes (${otherMatches.length}):**\n\n`);
        for (const match of otherMatches.slice(0, 4)) {
          const extraNote = match.note;
          const extraSource = this.formatSourceLabel(extraNote.sourceChannel, extraNote.metadata);
          const extraTitle = this.truncate(extraNote.title || 'Untitled Note', 60);
          const extraEncodedArg = encodeURIComponent(JSON.stringify([extraNote.id]));
          md.appendMarkdown(`- [${extraTitle}](command:${EXTENSION_COMMANDS.OPEN_NOTE_DETAIL}?${extraEncodedArg}) *(${extraSource})*\n`);
        }
      }
    } else {
      const time = this.formatRelativeTime(commit.commitDate);
      const shortHash = commit.commitHash.substring(0, 7);
      const author = commit.author || 'Author';

      md.appendMarkdown(`**Commit:** \`${shortHash}\` by ${author} *(${time})*\n\n`);
      if (commit.commitMessage) {
        md.appendMarkdown(`*${commit.commitMessage}*\n\n`);
      }

      md.appendMarkdown(`---\n\n`);
      md.appendMarkdown(`[Explain Origin Lineage](command:${EXTENSION_COMMANDS.EXPLAIN_SNIPPET_ORIGIN})\n`);
    }

    const hoverRange = new vscode.Range(position.line, lineEndCharacter, position.line, lineEndCharacter + 1);
    return new vscode.Hover(md, hoverRange);
  }

  dispose(): void {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }
    if (this.abortController) {
      this.abortController.abort();
    }
    for (const d of this.disposables) {
      d.dispose();
    }
  }
}
