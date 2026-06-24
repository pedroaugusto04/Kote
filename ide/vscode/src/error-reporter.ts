import * as vscode from 'vscode';

/**
 * Centralized error reporter for the KB extension.
 *
 * Responsibilities:
 *  - Normalize errors (Error vs unknown) consistently in one place
 *  - Format user-facing messages with a standard prefix
 *  - (Future) send structured logs to an output channel for diagnostics
 */

const OUTPUT_CHANNEL_NAME = 'Kote';
let _channel: vscode.OutputChannel | undefined;

function getChannel(): vscode.OutputChannel {
  if (!_channel) {
    _channel = vscode.window.createOutputChannel(OUTPUT_CHANNEL_NAME);
  }
  return _channel;
}

/** Extract a readable message from any thrown value. */
export function toMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === 'string') return err;
  return String(err);
}

/**
 * Show an error notification and log it to the Output Channel.
 * Use this for errors that originate in the extension host
 * (commands, data loading) — NOT for errors that should only
 * appear inside a webview.
 */
export function reportError(context: string, err: unknown): void {
  const message = toMessage(err);
  const full = `[${context}] ${message}`;

  getChannel().appendLine(`ERROR ${new Date().toISOString()} ${full}`);

  vscode.window.showErrorMessage(`KB: ${message}`, 'Show Output').then((action) => {
    if (action === 'Show Output') getChannel().show();
  });
}

/**
 * Log an informational message to the Output Channel (not shown to user).
 */
export function logInfo(context: string, message: string): void {
  getChannel().appendLine(`INFO  ${new Date().toISOString()} [${context}] ${message}`);
}

/**
 * Dispose the output channel when the extension deactivates.
 */
export function disposeErrorReporter(): void {
  _channel?.dispose();
  _channel = undefined;
}
