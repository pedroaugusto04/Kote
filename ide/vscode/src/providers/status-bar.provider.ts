import * as vscode from 'vscode';

export class StatusBarProvider {
  readonly statusBarItem: vscode.StatusBarItem;

  constructor() {
    this.statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
    this.statusBarItem.command = 'kb.openChat';
    this.statusBarItem.tooltip = 'Kote — click to open chat';
    this.setNotConfigured();
    this.statusBarItem.show();
  }

  setNotConfigured() {
    this.statusBarItem.text = '$(database) KB: not connected';
    this.statusBarItem.color = new vscode.ThemeColor('statusBarItem.warningForeground');
    this.statusBarItem.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
  }

  setConnecting() {
    this.statusBarItem.text = '$(loading~spin) KB: connecting...';
    this.statusBarItem.color = undefined;
    this.statusBarItem.backgroundColor = undefined;
  }

  setProject(projectSlug: string) {
    this.statusBarItem.text = `$(database) KB: ${projectSlug}`;
    this.statusBarItem.color = undefined;
    this.statusBarItem.backgroundColor = undefined;
    this.statusBarItem.tooltip = `Kote — project: ${projectSlug}\nClick to open AI chat`;
  }

  setError(message: string) {
    this.statusBarItem.text = '$(warning) KB: error';
    this.statusBarItem.tooltip = `Kote — ${message}`;
    this.statusBarItem.color = new vscode.ThemeColor('statusBarItem.errorForeground');
    this.statusBarItem.backgroundColor = new vscode.ThemeColor('statusBarItem.errorBackground');
  }

  dispose() {
    this.statusBarItem.dispose();
  }
}
