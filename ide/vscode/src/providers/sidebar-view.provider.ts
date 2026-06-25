import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import * as vscode from 'vscode';
import { KbClient, isConfigured } from '../kb-client';
import type { KbProject, ChatToWebview, ChatFromWebview } from '../types';
import { toMessage, logInfo } from '../error-reporter';

// ---------------------------------------------------------------------------
// Provider for Sidebar (Chat + Login Setup)
// ---------------------------------------------------------------------------

export class SidebarViewProvider implements vscode.WebviewViewProvider {
  private _view?: vscode.WebviewView;
  activeProject: string | null;

  constructor(
    private readonly _extensionUri: vscode.Uri,
    private readonly _client: KbClient,
    initialProject: string | null,
  ) {
    this.activeProject = null; // Default to All Projects
  }

  resolveWebviewView(
    webviewView: vscode.WebviewView,
    _context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken,
  ): void {
    this._view = webviewView;

    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [this._extensionUri],
    };

    // Load initial HTML based on whether we are authenticated
    webviewView.webview.html = this._buildHtml(webviewView.webview);

    webviewView.webview.onDidReceiveMessage(async (msg: any) => {
      switch (msg.type) {
        case 'ready':
          logInfo('SidebarProvider', 'Webview ready');
          if (isConfigured()) {
            await this._loadProjects();
          }
          break;

        case 'loginGoogle':
          logInfo('SidebarProvider', 'Attempting Google token validation');
          try {
            await this._client.validateAndSetGoogleToken(msg.token);
            const { workspaces } = await this._client.listWorkspaces();
            
            if (workspaces.length === 1 && workspaces[0]) {
              // Auto-select single workspace
              await this._client.saveWorkspaceSelection(workspaces[0].workspaceSlug);
              this._client.reload();
              vscode.window.showInformationMessage(`Connected to workspace: ${workspaces[0].displayName || workspaces[0].workspaceSlug}`);
              this.reloadWebview();
              vscode.commands.executeCommand('kote.onAuthChange');
            } else {
              this._post({ type: 'loginSuccess', workspaces });
            }
          } catch (err: unknown) {
            this._post({ type: 'error', message: toMessage(err) });
          }
          break;

        case 'loginEmail':
          logInfo('SidebarProvider', `Attempting email login: ${msg.email}`);
          try {
            await this._client.login(msg.email, msg.password);
            const { workspaces } = await this._client.listWorkspaces();

            if (workspaces.length === 1 && workspaces[0]) {
              // Auto-select single workspace
              await this._client.saveWorkspaceSelection(workspaces[0].workspaceSlug);
              this._client.reload();
              vscode.window.showInformationMessage(`Connected to workspace: ${workspaces[0].displayName || workspaces[0].workspaceSlug}`);
              this.reloadWebview();
              vscode.commands.executeCommand('kote.onAuthChange');
            } else {
              this._post({ type: 'loginSuccess', workspaces });
            }
          } catch (err: unknown) {
            this._post({ type: 'error', message: toMessage(err) });
          }
          break;

        case 'selectWorkspace':
          logInfo('SidebarProvider', `Saving selected workspace: ${msg.workspaceSlug}`);
          try {
            await this._client.saveWorkspaceSelection(msg.workspaceSlug);
            this._client.reload();
            vscode.window.showInformationMessage(`Connected to workspace: ${msg.workspaceSlug}`);
            this.reloadWebview();
            vscode.commands.executeCommand('kote.onAuthChange');
          } catch (err: unknown) {
            this._post({ type: 'error', message: toMessage(err) });
          }
          break;

        case 'logout':
          logInfo('SidebarProvider', 'Logging out');
          try {
            await this._client.logout();
            this._client.reload();
            this.reloadWebview();
            vscode.window.showInformationMessage('Logged out successfully.');
            vscode.commands.executeCommand('kote.onAuthChange');
          } catch (err: unknown) {
            vscode.window.showErrorMessage(`Logout failed: ${toMessage(err)}`);
          }
          break;

        case 'ask':
          logInfo('SidebarProvider', `Asking question: ${msg.question}`);
          this._post({ type: 'thinking' });
          try {
            const result = await this._client.ask(msg.question, msg.projectSlug || undefined);
            this._post({
              type: 'answer',
              answer: result.answer,
              sources: result.sources ?? [],
              media: result.media ?? [],
            });
          } catch (err: unknown) {
            this._post({ type: 'error', message: toMessage(err) });
          }
          break;

        case 'downloadFile':
          logInfo('SidebarProvider', `Downloading file: ${msg.fileName}`);
          try {
            const buffer = Buffer.from(msg.mediaBase64, 'base64');
            const uri = await vscode.window.showSaveDialog({
              defaultUri: vscode.Uri.file(msg.fileName),
              filters: {
                'All Files': ['*'],
              },
            });
            if (uri) {
              await vscode.workspace.fs.writeFile(uri, buffer);
              vscode.window.showInformationMessage(`Saved: ${path.basename(uri.fsPath)}`);
            }
          } catch (err: unknown) {
            vscode.window.showErrorMessage(`Failed to save file: ${toMessage(err)}`);
          }
          break;

        case 'saveNote':
          logInfo('SidebarProvider', `Saving note: ${msg.title}`);
          try {
            const res = await this._client.createNote({
              title: msg.title,
              rawText: msg.content,
              projectSlug: msg.projectSlug || this.activeProject || this._client.defaultProjectSlug,
              sourceChannel: 'ai-chat',
              source: 'open-code',
            });
            this._post({
              type: 'noteSaved',
              noteId: res.noteId ?? res.id ?? '',
              projectName: msg.projectName
            });
            vscode.window.showInformationMessage(`Note saved to Kote — project: ${msg.projectSlug}`);
          } catch (err: unknown) {
            this._post({ type: 'error', message: toMessage(err) });
          }
          break;

        case 'agentMessage':
          logInfo('SidebarProvider', `Sending agent message: ${msg.messageText}`);
          this._post({ type: 'thinking' });
          try {
            const res = await this._client.sendConversationTurn({
              messageText: msg.messageText,
              senderId: 'vscode-user',
              chatId: 'vscode-chat',
              messageId: crypto.randomUUID(),
              hasMedia: false,
              media: {},
            }, undefined, msg.projectSlug || undefined);

            this._post({
              type: 'agentResponse',
              replyText: res.replyText,
              action: res.action,
              projectSlug: res.agent?.selectedProjectSlug || '',
            });

            if (res.action === 'submit') {
              vscode.window.showInformationMessage(`Note saved to Kote — project: ${res.agent?.selectedProjectSlug || 'Inbox'}`);
            }
          } catch (err: unknown) {
            this._post({ type: 'error', message: toMessage(err) });
          }
          break;

        case 'changeProject':
          logInfo('SidebarProvider', `Active project changed by user: ${msg.projectSlug}`);
          this.activeProject = msg.projectSlug || null;
          break;
      }
    });

    // Refresh projects when sidebar is visible again and configured
    webviewView.onDidChangeVisibility(async () => {
      if (webviewView.visible && isConfigured()) {
        await this._loadProjects();
      }
    });
  }

  reloadWebview() {
    if (this._view) {
      this._view.webview.html = this._buildHtml(this._view.webview);
    }
  }

  async setActiveProject(projectSlug: string) {
    this.activeProject = projectSlug;
    this._post({ type: 'setProject', projectSlug });
  }

  async refresh() {
    if (isConfigured()) {
      await this._loadProjects();
    }
  }

  private _post(msg: any) {
    this._view?.webview.postMessage(msg);
  }

  private async _loadProjects() {
    try {
      const projects = await this._client.listProjects();
      this._post({ type: 'projects', projects });
      this._post({
        type: 'setProject',
        projectSlug: this.activeProject ?? '',
      });
    } catch (err: unknown) {
      this._post({ type: 'error', message: toMessage(err) });
    }
  }

  private _buildHtml(webview: vscode.Webview): string {
    const nonce = crypto.randomBytes(16).toString('hex');
    const templateName = isConfigured() ? 'chat.html' : 'login.html';
    const htmlPath = path.join(this._extensionUri.fsPath, 'webview', templateName);
    const logoUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this._extensionUri, 'resources', 'Kote-Logo.png'),
    ).toString();

    let html = fs.readFileSync(htmlPath, 'utf8');
    html = html.replace(/\$\{nonce\}/g, nonce);
    html = html.replace(/\$\{cspSource\}/g, webview.cspSource);
    html = html.replace(/\$\{logoUri\}/g, logoUri);
    return html;
  }
}
