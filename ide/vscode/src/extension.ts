import * as vscode from 'vscode';
import { KbClient, isConfigured } from './kb-client';
import { detectActiveProject } from './project-detector';
import { SidebarViewProvider } from './providers/sidebar-view.provider';
import { StatusBarProvider } from './providers/status-bar.provider';
import { registerAskCommand } from './commands/ask.command';
import { registerSaveNoteCommand } from './commands/save-note.command';
import { disposeErrorReporter, logInfo } from './error-reporter';
import { AiHistoryManager } from './ai-history/history-manager';
import { ClaudeCodeHistoryProvider } from './ai-history/providers/claude-code.provider';
import { CodexHistoryProvider } from './ai-history/providers/codex.provider';
import { AntigravityHistoryProvider } from './ai-history/providers/antigravity.provider';
import { OpenCodeHistoryProvider } from './ai-history/providers/opencode.provider';

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

  if (!isConfigured()) {
    statusBarProvider.setNotConfigured();
  } else {
    statusBarProvider.setConnecting();
    try {
      activeProject = await detectActiveProject(kbClient, folders);
    } catch { /* silent — will show in sidebar */ }
    statusBarProvider.setProject(activeProject ?? kbClient.defaultProjectSlug);
  }

  // -------------------------------------------------------------------------
  // Sidebar (Loads either Chat or Login form)
  // -------------------------------------------------------------------------
  sidebarProvider = new SidebarViewProvider(context.extensionUri, kbClient, activeProject);
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
          activeProject = await detectActiveProject(kbClient, folders);
        } catch {}
        statusBarProvider.setProject(activeProject ?? kbClient.defaultProjectSlug);
      } else {
        statusBarProvider.setNotConfigured();
      }
    })
  );

  // -------------------------------------------------------------------------
  // AI Session Watchers
  // -------------------------------------------------------------------------
  const historyManager = new AiHistoryManager();
  historyManager.registerProvider(new ClaudeCodeHistoryProvider());
  historyManager.registerProvider(new CodexHistoryProvider());
  historyManager.registerProvider(new AntigravityHistoryProvider());
  historyManager.registerProvider(new OpenCodeHistoryProvider());

  context.subscriptions.push(
    vscode.commands.registerCommand('kote.showRecentAiSessions', () => {
      historyManager.showRecentSessions(kbClient);
    }),

    vscode.commands.registerCommand('kote.configureAiSessionMode', () => {
      historyManager.promptModeSelection(context);
    })
  );

  historyManager.startWatching(kbClient, context);

  registerAskCommand(context, kbClient, () => sidebarProvider.activeProject ?? activeProject ?? kbClient.defaultProjectSlug);
  registerSaveNoteCommand(
    context,
    kbClient,
    () => sidebarProvider.activeProject ?? activeProject ?? kbClient.defaultProjectSlug,
    historyManager
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
          statusBarProvider.setProject(updated);
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
