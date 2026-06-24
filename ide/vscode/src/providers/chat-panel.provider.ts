import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import * as vscode from 'vscode';
import type { KbClient } from '../kb-client';
import type { KbProject, ChatToWebview, ChatFromWebview } from '../types';
import { toMessage, logInfo } from '../error-reporter';

// ---------------------------------------------------------------------------
// Chat panel (singleton)
// ---------------------------------------------------------------------------

export class ChatPanelProvider {
  private static _current: ChatPanelProvider | undefined;

  private readonly _panel: vscode.WebviewPanel;
  private _disposables: vscode.Disposable[] = [];

  static createOrShow(
    context: vscode.ExtensionContext,
    client: KbClient,
    activeProject: string | null,
  ) {
    // Reuse existing panel if open
    if (ChatPanelProvider._current) {
      logInfo('ChatPanelProvider', 'Reusing existing chat panel');
      ChatPanelProvider._current._panel.reveal(vscode.ViewColumn.Two);
      // Update active project
      ChatPanelProvider._current._post({
        type: 'setProject',
        projectSlug: activeProject ?? client.defaultProjectSlug,
      });
      return;
    }

    logInfo('ChatPanelProvider', 'Creating new chat panel');
    const panel = vscode.window.createWebviewPanel(
      'kote.chatPanel',
      'KB: Ask AI',
      vscode.ViewColumn.Two,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [context.extensionUri],
      },
    );

    ChatPanelProvider._current = new ChatPanelProvider(panel, context, client, activeProject);
  }

  private constructor(
    panel: vscode.WebviewPanel,
    context: vscode.ExtensionContext,
    private readonly _client: KbClient,
    private _activeProject: string | null,
  ) {
    this._panel = panel;

    panel.iconPath = vscode.Uri.joinPath(context.extensionUri, 'resources', 'Kote-Logo.svg');
    panel.webview.options = { enableScripts: true, localResourceRoots: [context.extensionUri] };
    panel.webview.html = this._buildHtml(panel.webview, context.extensionUri);

    panel.webview.onDidReceiveMessage(
      (msg: ChatFromWebview) => this._handleMessage(msg),
      undefined,
      this._disposables,
    );

    panel.onDidDispose(() => this._dispose(), undefined, this._disposables);
  }

  private _post(msg: ChatToWebview) {
    this._panel.webview.postMessage(msg);
  }

  private async _handleMessage(msg: ChatFromWebview) {
    switch (msg.type) {
      case 'ready': {
        const projects = await this._loadProjects();
        this._post({ type: 'projects', projects });
        this._post({
          type: 'setProject',
          projectSlug: this._activeProject ?? this._client.defaultProjectSlug,
        });
        break;
      }

      case 'ask': {
        this._post({ type: 'thinking' });
        try {
          const result = await this._client.ask(msg.question, msg.projectSlug || undefined);
          this._post({
            type: 'answer',
            answer: result.answer,
            confidence: result.confidence,
            sources: result.sources ?? [],
          });
        } catch (err: unknown) {
          this._post({ type: 'error', message: toMessage(err) });
        }
        break;
      }

      case 'saveNote': {
        try {
          const res = await this._client.createNote({
            title: msg.title,
            rawText: msg.content,
            projectSlug: msg.projectSlug || this._activeProject || this._client.defaultProjectSlug,
            sourceChannel: 'ai-chat',
            source: 'open-code',
          });
          this._post({ type: 'noteSaved', noteId: res.noteId ?? res.id ?? '' });
          vscode.window.showInformationMessage(`Note saved to KB — project: ${msg.projectSlug}`);
        } catch (err: unknown) {
          this._post({ type: 'error', message: toMessage(err) });
        }
        break;
      }
    }
  }

  private async _loadProjects(): Promise<KbProject[]> {
    try {
      return await this._client.listProjects();
    } catch {
      return [];
    }
  }

  private _buildHtml(webview: vscode.Webview, extensionUri: vscode.Uri): string {
    const nonce = crypto.randomBytes(16).toString('hex');
    const htmlPath = path.join(extensionUri.fsPath, 'webview', 'chat.html');

    let html = fs.readFileSync(htmlPath, 'utf8');
    html = html.replace(/\$\{nonce\}/g, nonce);
    html = html.replace(/\$\{cspSource\}/g, webview.cspSource);
    return html;
  }

  private _dispose() {
    ChatPanelProvider._current = undefined;
    this._panel.dispose();
    for (const d of this._disposables) d.dispose();
    this._disposables = [];
  }
}
