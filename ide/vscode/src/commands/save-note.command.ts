import * as vscode from 'vscode';
import type { KbClient } from '../kb-client';
import { reportError } from '../error-reporter';
import type { AiHistoryManager } from '../ai-history/history-manager';
import { EXTENSION_COMMANDS, SOURCE_CHANNELS } from '../constants';

/**
 * Right-click on a selection → "Kote: Save Selection as Note"
 * Also available via Command Palette.
 */
export function registerSaveNoteCommand(
  context: vscode.ExtensionContext,
  client: KbClient,
  getProject: () => string,
  historyManager?: AiHistoryManager
): void {
  context.subscriptions.push(
    vscode.commands.registerCommand(EXTENSION_COMMANDS.SAVE_SELECTION, async () => {
      const editor = vscode.window.activeTextEditor;
      const selectedText = editor?.document.getText(editor.selection)?.trim();
      const fileName = editor ? vscode.workspace.asRelativePath(editor.document.fileName) : '';
      const languageId = editor?.document.languageId || '';
      const isMarkdown = languageId === 'markdown';

      // Prompt for an optional context/title
      const context_ = await vscode.window.showInputBox({
        prompt: 'Add context (optional)',
        placeHolder: selectedText
          ? `Code snippet from ${fileName}`
          : 'Describe what you want to save',
        ignoreFocusOut: false,
      });

      if (context_ === undefined) return; // user cancelled

      const formattedSelection = isMarkdown ? selectedText : `\`\`\`${languageId}\n${selectedText}\n\`\`\``;
      const rawText = selectedText
        ? `${context_ ? `${context_}\n\n` : ''}From \`${fileName}\`:\n${formattedSelection}`
        : context_;

      if (!rawText?.trim()) {
        vscode.window.showWarningMessage('Nothing to save.');
        return;
      }

      await vscode.window.withProgress(
        { location: vscode.ProgressLocation.Notification, title: 'Saving note…', cancellable: false },
        async () => {
          try {
            await client.createNote({
              rawText,
              title: context_ || (selectedText ? `Snippet from ${fileName}` : undefined),
              projectSlug: getProject(),
              source: SOURCE_CHANNELS.IDE,
              sourceChannel: SOURCE_CHANNELS.IDE,
            });
            vscode.window.showInformationMessage(`Note saved to Kote — project: ${getProject()}`);
            // Trigger sidebar refresh
            vscode.commands.executeCommand(EXTENSION_COMMANDS.REFRESH);
          } catch (err: unknown) {
            reportError('save-note', err);
          }
        },
      );
    }),

    vscode.commands.registerCommand(EXTENSION_COMMANDS.SAVE_ACTIVE_FILE, async (sessionIdParam?: string, providerIdParam?: string) => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) {
        vscode.window.showWarningMessage('No active editor open.');
        return;
      }
      const rawText = editor.document.getText()?.trim();
      if (!rawText) {
        vscode.window.showWarningMessage('The active file is empty.');
        return;
      }

      const languageId = editor.document.languageId || '';
      const isMarkdown = languageId === 'markdown';

      // Infer title from the first header or first line
      let title = 'Unsaved Note';
      const lines = rawText.split('\n');
      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed.startsWith('# ')) {
          title = trimmed.substring(2).trim();
          break;
        } else if (trimmed) {
          title = trimmed.slice(0, 50);
          break;
        }
      }

      const confirm = await vscode.window.showInputBox({
        prompt: 'Confirm note title',
        value: title,
        ignoreFocusOut: false,
      });

      if (confirm === undefined) return;

      let source = providerIdParam || SOURCE_CHANNELS.IDE;
      let sourceChannel: string | undefined = providerIdParam ? SOURCE_CHANNELS.AI_CHAT : SOURCE_CHANNELS.IDE;
      let sessionId: string | undefined = sessionIdParam;

      await vscode.window.withProgress(
        { location: vscode.ProgressLocation.Notification, title: 'Saving note…', cancellable: false },
        async () => {
          try {
            await client.createNote({
              rawText: isMarkdown ? rawText : `\`\`\`${languageId}\n${rawText}\n\`\`\``,
              title: confirm || title,
              projectSlug: getProject(),
              sourceChannel,
              source,
              sessionId,
            });
            vscode.window.showInformationMessage(`Note saved to Kote — project: ${getProject()}`);
            if (sessionId && providerIdParam) {
              historyManager?.markSessionAsSaved(providerIdParam, sessionId);
            }
            vscode.commands.executeCommand(EXTENSION_COMMANDS.REFRESH);
          } catch (err: unknown) {
            reportError('save-active-file', err);
          }
        },
      );
    })
  );
}

