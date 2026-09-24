import * as vscode from 'vscode';
import { KbClient, isConfigured } from './kb-client';
import { detectActiveProject } from './project-detector';
import { SidebarViewProvider } from './providers/sidebar-view.provider';
import { StatusBarProvider } from './providers/status-bar.provider';
import { registerAskCommand } from './commands/ask.command';
import { registerSaveNoteCommand } from './commands/save-note.command';
import { registerExplainSnippetOriginCommand } from './commands/explain-snippet-origin.command';
import { disposeErrorReporter, logInfo, toMessage } from './error-reporter';
import { AiHistoryManager } from './ai-history/history-manager';
import { ClaudeCodeHistoryProvider } from './ai-history/providers/claude-code.provider';
import { CodexHistoryProvider } from './ai-history/providers/codex.provider';
import { AntigravityHistoryProvider } from './ai-history/providers/antigravity.provider';
import { OpenCodeHistoryProvider } from './ai-history/providers/opencode.provider';
import { autoRegisterHarnessHooks } from './ai-history/hooks/installer';
import { KoteCodeLensProvider } from './providers/codelens.provider';
import { KoteNoteContentProvider } from './providers/note-viewer.provider';
import { FileNotesSummaryProvider } from './providers/file-notes-summary.provider';
import { NoteDetailWebviewProvider } from './providers/note-detail-webview.provider';
import { LineContextProvider } from './providers/line-context.provider';
import { resolveProjectSlug } from './utils/project';

let kbClient: KbClient;
let sidebarProvider: SidebarViewProvider;
let statusBarProvider: StatusBarProvider;

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  logInfo('Extension', `Extension activate() started. isConfigured: ${isConfigured()}`);
  kbClient = new KbClient();

  kbClient.onUnauthorized = () => {
    logInfo('Extension', 'Session expired, triggering onAuthChange and reloading webview');
    vscode.commands.executeCommand('kote.onAuthChange');
    sidebarProvider.reloadWebview();
    vscode.window.showErrorMessage('Your Kote session has expired. Please log in again.');
  };

  // -------------------------------------------------------------------------
  // Status bar
  // -------------------------------------------------------------------------
  statusBarProvider = new StatusBarProvider();
  context.subscriptions.push(statusBarProvider.statusBarItem);

  const folders = vscode.workspace.workspaceFolders ?? [];
  let activeProject: string | null = null;

  /** Fetches coverage in the background and updates the status bar. */
  async function setProjectWithCoverage(slug: string): Promise<void> {
    statusBarProvider.setProject(slug);
    const coverage = await kbClient.getProjectCoverage(slug).catch(() => null);
    if (typeof coverage === 'number') {
      statusBarProvider.setProject(slug, coverage);
    }
  }

  if (!isConfigured()) {
    statusBarProvider.setNotConfigured();
  } else {
    statusBarProvider.setConnecting();
    try {
      const savedProject = context.workspaceState.get<string | null>('kote.activeProjectSlug', null);
      if (savedProject !== null && savedProject !== 'auto') {
        activeProject = savedProject;
      } else {
        activeProject = await detectActiveProject(kbClient, folders);
      }
    } catch { /* silent — will show in sidebar */ }
    void setProjectWithCoverage(resolveProjectSlug(activeProject, kbClient.defaultProjectSlug));
  }

  // -------------------------------------------------------------------------
  // AI Session Watchers
  // -------------------------------------------------------------------------
  const historyManager = new AiHistoryManager();
  historyManager.registerProvider(new ClaudeCodeHistoryProvider());
  historyManager.registerProvider(new CodexHistoryProvider());
  historyManager.registerProvider(new AntigravityHistoryProvider());
  historyManager.registerProvider(new OpenCodeHistoryProvider());

  // -------------------------------------------------------------------------
  // Sidebar (Loads either Chat or Login form)
  // -------------------------------------------------------------------------
  sidebarProvider = new SidebarViewProvider(context.extensionUri, kbClient, activeProject, historyManager, context);
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider('kote.sidebarView', sidebarProvider, {
      webviewOptions: { retainContextWhenHidden: true },
    }),
  );

  // -------------------------------------------------------------------------
  // Commands
  // -------------------------------------------------------------------------
  context.subscriptions.push(
    vscode.commands.registerCommand('kote.openChat', async (args?: { question?: string; answer?: string; projectSlug?: string }) => {
      logInfo('Extension', 'kote.openChat command triggered');
      vscode.commands.executeCommand('kote.sidebarView.focus');
      if (args?.question && args?.answer) {
        // Give the webview a moment to get focus before injecting the Q&A
        setTimeout(() => {
          sidebarProvider.injectQA(args.question!, args.answer!, args.projectSlug ?? '');
        }, 300);
      }
    }),

    vscode.commands.registerCommand('kote.refresh', () => {
      sidebarProvider.refresh();
    }),

    vscode.commands.registerCommand('kote.onAuthChange', async () => {
      logInfo('Extension', 'kote.onAuthChange command triggered');
      kbClient.reload();
      if (isConfigured()) {
        try {
          const savedProject = context.workspaceState.get<string | null>('kote.activeProjectSlug', null);
          if (savedProject !== null && savedProject !== 'auto') {
            activeProject = savedProject;
          } else {
            activeProject = await detectActiveProject(kbClient, folders);
          }
        } catch {}
        void setProjectWithCoverage(resolveProjectSlug(activeProject, kbClient.defaultProjectSlug));
        // Fire-and-forget: notify the backend that the VS Code extension is installed
        kbClient.reportVscodeInstalled().catch(() => { /* silent — best effort */ });
      } else {
        statusBarProvider.setNotConfigured();
      }
      vscode.commands.executeCommand('kote.refreshCodeLenses');
    }),

    vscode.commands.registerCommand('kote.updateStatusBar', async (projectSlug?: string) => {
      if (statusBarProvider) {
        let slug = projectSlug;
        if (!slug || slug === 'auto') {
          slug = (await detectActiveProject(kbClient, vscode.workspace.workspaceFolders ?? [])) || undefined;
        }
        void setProjectWithCoverage(resolveProjectSlug(slug, kbClient.defaultProjectSlug));
      }
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('kote.showRecentAiSessions', () => {
      historyManager.showRecentSessions(kbClient);
    }),

    vscode.commands.registerCommand('kote.configureAiSessionMode', () => {
      historyManager.promptModeSelection(context);
    }),

    vscode.commands.registerCommand('kote.openSyncTab', () => {
      sidebarProvider.switchToTab('sync');
    }),

    vscode.commands.registerCommand('kote.viewActiveSessionHandoff', async () => {
      const markdown = historyManager.handoff.getActiveHandoffMarkdown();
      if (!markdown) {
        vscode.window.showInformationMessage('Kote: No active session handoff context available yet.');
        return;
      }
      await historyManager.handoff.openHandoffPreview(markdown, 'active chat');
    }),

    vscode.commands.registerCommand('kote.copySessionHandoff', async () => {
      await historyManager.handoff.showHandoffQuickPick(historyManager.getRecentSessionsList());
    })
  );

  void autoRegisterHarnessHooks().catch((err) => {
    logInfo('Hooks', `Auto-registration of harness hooks skipped: ${toMessage(err)}`);
  });

  const getActiveProjectSlug = () => resolveProjectSlug(sidebarProvider?.activeProject ?? activeProject, kbClient.defaultProjectSlug);
  const getActiveProjectSelection = () => ({
    projectSlug: sidebarProvider?.activeProject ?? activeProject,
    isManuallySelected: (() => {
      const savedProject = context.workspaceState.get<string | null>('kote.activeProjectSlug', null);
      return savedProject !== null && savedProject !== 'auto';
    })(),
  });
  historyManager.startWatching(kbClient, context, getActiveProjectSelection);

  registerAskCommand(context, kbClient, getActiveProjectSlug);
  registerSaveNoteCommand(
    context,
    kbClient,
    getActiveProjectSlug,
    historyManager
  );
  registerExplainSnippetOriginCommand(context, kbClient, getActiveProjectSlug);

  // -------------------------------------------------------------------------
  // CodeLens & Note Content Providers (Engineering Memory)
  // -------------------------------------------------------------------------
  const noteContentProvider = new KoteNoteContentProvider(kbClient);
  context.subscriptions.push(
    vscode.workspace.registerTextDocumentContentProvider('kote-note', noteContentProvider)
  );

  const codeLensProvider = new KoteCodeLensProvider(kbClient);
  context.subscriptions.push(
    vscode.languages.registerCodeLensProvider({ scheme: 'file' }, codeLensProvider)
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('kote.showFileNotes', async (relativePath: string, notes: any[]) => {
      const projectSlug = getActiveProjectSlug();
      await FileNotesSummaryProvider.show(context.extensionUri, kbClient, relativePath, notes, projectSlug);
    }),
    vscode.commands.registerCommand('kote.openNoteDetail', async (noteId: string) => {
      if (!noteId) return;
      await NoteDetailWebviewProvider.show(context.extensionUri, kbClient, noteId);
    }),
    vscode.commands.registerCommand('kote.showProjectDecisions', async () => {
      const projectSlug = getActiveProjectSlug();
      if (!projectSlug) {
        vscode.window.showInformationMessage('No active Kote project found.');
        return;
      }

      await vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: `Fetching decisions for ${projectSlug}...`,
          cancellable: false,
        },
        async () => {
          try {
            const res = await kbClient.listProjectDecisions(projectSlug, { pageSize: 50 });
            if (!res.items || res.items.length === 0) {
              vscode.window.showInformationMessage(`No recorded architecture decisions found for project "${projectSlug}".`);
              return;
            }

            const items: (vscode.QuickPickItem & { noteId?: string })[] = res.items.map((item) => {
              const statusMap: Record<string, string> = {
                current: 'Accepted',
                superseded: 'Superseded',
                rejected: 'Rejected',
                deprecated: 'Deprecated',
              };
              const statusLabel = statusMap[item.status] || item.status.toUpperCase();
              const kindLabel = item.kind === 'failed_attempt' ? 'Failed Attempt' : 'Decision';
              const filesInfo = item.files.length > 0 ? ` • ${item.files.length} file(s)` : '';
              const dateInfo = item.occurredAt ? item.occurredAt.split('T')[0] : '';

              return {
                label: `[${statusLabel}] ${item.text.split('\n')[0].replace(/^#+\s*/, '').slice(0, 80)}`,
                description: `${kindLabel} • ${dateInfo}${filesInfo}`,
                detail: item.text,
                noteId: item.noteId,
              };
            });

            const picked = await vscode.window.showQuickPick(items, {
              placeHolder: `Select an ADR/Decision to view details (${items.length} decisions)`,
              matchOnDescription: true,
              matchOnDetail: true,
            });

            if (picked?.noteId) {
              await vscode.commands.executeCommand('kote.openNoteDetail', picked.noteId);
            }
          } catch (err: any) {
            vscode.window.showErrorMessage(`Failed to fetch project decisions: ${toMessage(err)}`);
          }
        }
      );
    }),
  );

  // -------------------------------------------------------------------------
  // Inline Context & Line Blame Annotation
  // -------------------------------------------------------------------------
  const lineContextProvider = new LineContextProvider(kbClient, getActiveProjectSlug);
  context.subscriptions.push(
    lineContextProvider,
    vscode.languages.registerHoverProvider({ scheme: 'file' }, lineContextProvider),
  );

  // -------------------------------------------------------------------------
  // Auto-refresh sidebar when window regains focus
  // -------------------------------------------------------------------------
  context.subscriptions.push(
    vscode.window.onDidChangeWindowState((e) => {
      if (e.focused) sidebarProvider.refresh();
    }),
  );

  // -------------------------------------------------------------------------
  // Re-detect project when workspace folders change
  // -------------------------------------------------------------------------
  context.subscriptions.push(
    vscode.workspace.onDidChangeWorkspaceFolders(async () => {
      if (!isConfigured()) return;
      const updatedFolders = vscode.workspace.workspaceFolders ?? [];
      try {
        const updated = await detectActiveProject(kbClient, updatedFolders);
        if (updated) {
          void setProjectWithCoverage(updated);
          sidebarProvider.setActiveProject(updated);
        }
      } catch { /* silent */ }
    }),
  );
}

export function deactivate(): void {
  statusBarProvider?.dispose();
  disposeErrorReporter();
}
