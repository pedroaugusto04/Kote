import * as vscode from 'vscode';
import type { KbClient } from '../kb-client';
import { reportError } from '../error-reporter';

/**
 * Right-click on a selection → "KB: Save Selection as Note"
 * Also available via Command Palette.
 */
export function registerSaveNoteCommand(
  context: vscode.ExtensionContext,
  client: KbClient,
  getProject: () => string,
): void {
  context.subscriptions.push(
    vscode.commands.registerCommand('kb.saveSelection', async () => {
      const editor = vscode.window.activeTextEditor;
      const selectedText = editor?.document.getText(editor.selection)?.trim();
      const fileName = editor ? vscode.workspace.asRelativePath(editor.document.fileName) : '';

      // Prompt for an optional context/title
      const context_ = await vscode.window.showInputBox({
        prompt: 'Add context (optional)',
        placeHolder: selectedText
          ? `Code snippet from ${fileName}`
          : 'Describe what you want to save',
        ignoreFocusOut: false,
      });

      if (context_ === undefined) return; // user cancelled

      const rawText = selectedText
        ? `${context_ ? `${context_}\n\n` : ''}From \`${fileName}\`:\n\`\`\`\n${selectedText}\n\`\`\``
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
            });
            vscode.window.showInformationMessage(`Note saved to KB — project: ${getProject()}`);
            // Trigger sidebar refresh
            vscode.commands.executeCommand('kb.refresh');
          } catch (err: unknown) {
            reportError('save-note', err);
          }
        },
      );
    }),

    vscode.commands.registerCommand('kb.saveActiveFile', async () => {
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

      await vscode.window.withProgress(
        { location: vscode.ProgressLocation.Notification, title: 'Saving note…', cancellable: false },
        async () => {
          try {
            await client.createNote({
              rawText,
              title: confirm || title,
              projectSlug: getProject(),
            });
            vscode.window.showInformationMessage(`Note saved to KB — project: ${getProject()}`);
            vscode.commands.executeCommand('kb.refresh');
          } catch (err: unknown) {
            reportError('save-active-file', err);
          }
        },
      );
    })
  );
}
