import * as vscode from 'vscode';
import { KbClient } from '../kb-client';

export class KoteCodeLensProvider implements vscode.CodeLensProvider {
  private _onDidChangeCodeLenses = new vscode.EventEmitter<void>();
  readonly onDidChangeCodeLenses = this._onDidChangeCodeLenses.event;

  constructor(private readonly kbClient: KbClient) {
    // Register command to force refresh the CodeLenses
    vscode.commands.registerCommand('kote.refreshCodeLenses', () => {
      this._onDidChangeCodeLenses.fire();
    });
  }

  async provideCodeLenses(
    document: vscode.TextDocument,
    token: vscode.CancellationToken
  ): Promise<vscode.CodeLens[]> {
    if (document.uri.scheme !== 'file') {
      return [];
    }

    // Skip custom documents or untitled/unsaved files
    if (document.isUntitled) {
      return [];
    }

    const relativePath = vscode.workspace.asRelativePath(document.uri);

    try {
      const notes = await this.kbClient.findNotesByFile(relativePath);
      if (!notes || notes.length === 0) {
        return [];
      }

      const range = new vscode.Range(0, 0, 0, 0);
      const command: vscode.Command = {
        title: `💡 Kote: ${notes.length} ${notes.length === 1 ? 'note' : 'notes'}/decisions about this file`,
        command: 'kote.showFileNotes',
        arguments: [relativePath, notes],
      };

      return [new vscode.CodeLens(range, command)];
    } catch {
      return [];
    }
  }
}
