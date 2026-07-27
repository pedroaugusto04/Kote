import * as vscode from 'vscode';

export class StatusBarProvider {
  readonly statusBarItem: vscode.StatusBarItem;

  constructor() {
    this.statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
    this.statusBarItem.command = 'kote.openChat';
    this.statusBarItem.tooltip = 'Kote — click to open chat';
    this.setNotConfigured();
    this.statusBarItem.show();
  }

  setNotConfigured() {
    this.statusBarItem.text = '$(database) Kote: not connected';
    this.statusBarItem.color = new vscode.ThemeColor('statusBarItem.warningForeground');
    this.statusBarItem.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
  }

  setConnecting() {
    this.statusBarItem.text = '$(loading~spin) Kote: connecting...';
    this.statusBarItem.color = undefined;
    this.statusBarItem.backgroundColor = undefined;
  }

  setProject(projectSlug: string, coveragePercentage?: number) {
    const coverageStr = typeof coveragePercentage === 'number' ? ` (${coveragePercentage}% Covered)` : '';
    this.statusBarItem.text = `$(database) Kote: ${projectSlug}${coverageStr}`;
    this.statusBarItem.color = undefined;
    this.statusBarItem.backgroundColor = undefined;
    this.statusBarItem.tooltip = `Kote — project: ${projectSlug}${coverageStr}\nClick to open AI chat`;
  }

  setError(message: string) {
    this.statusBarItem.text = '$(warning) Kote: error';
    this.statusBarItem.tooltip = `Kote — ${message}`;
    this.statusBarItem.color = new vscode.ThemeColor('statusBarItem.errorForeground');
    this.statusBarItem.backgroundColor = new vscode.ThemeColor('statusBarItem.errorBackground');
  }

  dispose() {
    this.statusBarItem.dispose();
  }
}
