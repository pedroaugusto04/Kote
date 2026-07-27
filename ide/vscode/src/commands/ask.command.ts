import * as vscode from 'vscode';
import type { KbClient } from '../kb-client';
import { reportError, toMessage } from '../error-reporter';
import { addAskEntry } from '../utils/ask-history';

/**
 * Quick ask via VS Code's input box (Ctrl+Shift+K).
 * Shows answer in an information message with a "Show in Chat" option
 * for long responses.
 */
export function registerAskCommand(
  context: vscode.ExtensionContext,
  client: KbClient,
  getProject: () => string,
): void {
  context.subscriptions.push(
    vscode.commands.registerCommand('kote.ask', async () => {
      const question = await vscode.window.showInputBox({
        prompt: 'Ask your Kote',
        placeHolder: 'e.g. How is authentication configured in this project?',
        ignoreFocusOut: false,
      });

      if (!question?.trim()) return;

      await vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: 'Kote',
          cancellable: false,
        },
        async (progress) => {
          progress.report({ message: 'Searching…' });
          try {
            const result = await client.ask(question.trim(), getProject());
            const answer = result.answer?.trim() ?? 'No answer found.';
            const projectSlug = getProject();

            // Persist to local history
            addAskEntry({ question: question.trim(), answer, projectSlug });

            // For short answers, show inline. For long ones, open chat.
            if (answer.length < 400) {
              const action = await vscode.window.showInformationMessage(
                answer,
                { modal: false },
                'Open Chat',
                'Save as Note',
              );

              if (action === 'Open Chat') {
                vscode.commands.executeCommand('kote.openChat', { question: question.trim(), answer, projectSlug });
              } else if (action === 'Save as Note') {
                try {
                  await client.createNote({
                    rawText: `**Q:** ${question}\n\n**A:** ${answer}`,
                    projectSlug,
                    sourceChannel: 'ai-chat',
                    source: 'kote',
                  });
                  vscode.window.showInformationMessage('Note saved to Kote.');
                } catch (err: unknown) {
                  reportError('save-note (from ask)', err);
                }
              }
            } else {
              // Open chat with context of this question pre-sent
              vscode.commands.executeCommand('kote.openChat', { question: question.trim(), answer, projectSlug });
              vscode.window.showInformationMessage(
                'Answer is long — opened in Kote Chat.',
                'OK',
              );
            }
          } catch (err: unknown) {
            reportError('ask', err);
          }
        },
      );
    }),
  );
}
