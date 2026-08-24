import * as vscode from 'vscode';
import type { KbClient } from '../kb-client';
import { EXTENSION_COMMANDS } from '../constants';
import { extractGitSnippetOrigin } from '../utils/git-blame';
import { SnippetOriginSummaryProvider } from '../providers/snippet-origin-summary.provider';

export function registerExplainSnippetOriginCommand(
  context: vscode.ExtensionContext,
  kbClient: KbClient,
): void {
  context.subscriptions.push(
    vscode.commands.registerCommand(
      EXTENSION_COMMANDS.EXPLAIN_SNIPPET_ORIGIN,
      async () => {
        const editor = vscode.window.activeTextEditor;
        if (!editor || editor.document.uri.scheme !== 'file') {
          vscode.window.showWarningMessage('Please open a file and select a code snippet to explain.');
          return;
        }

        const document = editor.document;
        let selection = editor.selection;
        let selectedText = document.getText(selection).trim();
        let startLine = selection.start.line + 1; // 1-indexed
        let endLine = selection.end.line + 1;

        // If no explicit selection, fallback to current line
        if (!selectedText) {
          const currentLine = editor.selection.active.line;
          selectedText = document.lineAt(currentLine).text.trim();
          startLine = currentLine + 1;
          endLine = currentLine + 1;
        }

        if (!selectedText) {
          vscode.window.showWarningMessage('No code selected.');
          return;
        }

        const relativePath = vscode.workspace.asRelativePath(document.uri);
        const workspaceFolder = vscode.workspace.getWorkspaceFolder(document.uri);
        const workspaceRoot = workspaceFolder ? workspaceFolder.uri.fsPath : '';

        let gitInfo = null;
        if (workspaceRoot) {
          gitInfo = await extractGitSnippetOrigin(workspaceRoot, relativePath, startLine, endLine);
        }

        await SnippetOriginSummaryProvider.show(context.extensionUri, kbClient, {
          filePath: relativePath,
          snippet: selectedText,
          startLine,
          endLine,
          gitInfo,
        });
      },
    ),
  );
}
