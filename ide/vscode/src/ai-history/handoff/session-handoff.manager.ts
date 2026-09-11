import * as vscode from 'vscode';

import type { KbClient } from '../../kb-client';
import { toMessage } from '../../error-reporter';
import type { AiHistoryProvider, AiSession } from '../types';

export class SessionHandoffManager {
  private lastHandoffMarkdown: string | null = null;
  private promptedHandoffPairs = new Set<string>();
  private readonly HANDOFF_RECENCY_MAX_AGE_MS = 8 * 60 * 60 * 1000; // 8 hours

  constructor(
    private readonly getClient: () => KbClient,
    private readonly getProviders: () => Map<string, AiHistoryProvider>,
    private readonly formatSessionMarkdown: (session: AiSession) => string,
  ) {}

  onNewSessionDetected(
    currentProvider: AiHistoryProvider,
    currentSession: AiSession,
    recentSessions: AiSession[],
  ): void {
    const candidate = this.findCandidatePreviousSession(currentSession, recentSessions);
    if (!candidate) return;

    const pairKey = `${candidate.sessionId}->${currentSession.sessionId}`;
    if (this.promptedHandoffPairs.has(pairKey)) return;
    this.promptedHandoffPairs.add(pairKey);

    void this.promptSessionHandoff(currentProvider, currentSession, candidate);
  }

  findCandidatePreviousSession(
    currentSession: AiSession,
    recentSessions: AiSession[],
  ): AiSession | null {
    const now = Date.now();
    for (const s of recentSessions) {
      if (s.sessionId === currentSession.sessionId) continue;
      if (s.providerId === currentSession.providerId) continue;
      if (s.turns.length < 2) continue;
      if (now - s.timestamp > this.HANDOFF_RECENCY_MAX_AGE_MS) continue;
      return s;
    }
    return null;
  }

  private async promptSessionHandoff(
    currentProvider: AiHistoryProvider,
    _currentSession: AiSession,
    candidate: AiSession,
  ): Promise<void> {
    const providers = this.getProviders();
    const prevProviderName = providers.get(candidate.providerId)?.name || candidate.providerId;
    const newProviderName = currentProvider.name;

    const message = `Kote: Previous session detected in ${prevProviderName} ("${candidate.title}"). Inject this context into ${newProviderName}?`;
    const action = await vscode.window.showInformationMessage(
      message,
      'Inject Now',
      'Review and Accept',
      'Ignore',
    );

    if (action === 'Inject Now') {
      await this.generateAndInjectHandoff(candidate, newProviderName);
    } else if (action === 'Review and Accept') {
      await this.generateAndReviewHandoff(candidate, newProviderName);
    }
  }

  async generateAndInjectHandoff(
    previousSession: AiSession,
    targetProviderName?: string,
  ): Promise<string | null> {
    try {
      const client = this.getClient();
      const targetName = targetProviderName || 'new chat';
      const rawText = this.formatSessionMarkdown(previousSession);
      const res = await client.getSessionHandoff({
        rawText,
        provider: previousSession.providerId,
        projectSlug: previousSession.projectSlug,
      });

      if (res && res.handoffMarkdown) {
        this.lastHandoffMarkdown = res.handoffMarkdown;
        await vscode.env.clipboard.writeText(res.handoffMarkdown);

        const choice = await vscode.window.showInformationMessage(
          `Kote: Session handoff context injected. Copied to clipboard for ${targetName}.`,
          'View Injected Context',
        );
        if (choice === 'View Injected Context') {
          await this.openHandoffPreview(res.handoffMarkdown, targetName);
        }
        return res.handoffMarkdown;
      }
    } catch (err) {
      vscode.window.showErrorMessage(`Kote: Failed to generate session handoff: ${toMessage(err)}`);
    }
    return null;
  }

  async generateAndReviewHandoff(
    previousSession: AiSession,
    targetProviderName?: string,
  ): Promise<void> {
    try {
      const client = this.getClient();
      const targetName = targetProviderName || 'new chat';
      const rawText = this.formatSessionMarkdown(previousSession);
      const res = await client.getSessionHandoff({
        rawText,
        provider: previousSession.providerId,
        projectSlug: previousSession.projectSlug,
      });

      if (res && res.handoffMarkdown) {
        this.lastHandoffMarkdown = res.handoffMarkdown;
        await this.openHandoffPreview(res.handoffMarkdown, targetName);
      }
    } catch (err) {
      vscode.window.showErrorMessage(`Kote: Failed to generate session handoff: ${toMessage(err)}`);
    }
  }

  async openHandoffPreview(markdown: string, targetProviderName: string): Promise<void> {
    try {
      const doc = await vscode.workspace.openTextDocument({
        content: markdown,
        language: 'markdown',
      });
      await vscode.window.showTextDocument(doc);

      const action = await vscode.window.showInformationMessage(
        `Kote: Review the generated handoff. Choose "Accept and Inject" to copy context for ${targetProviderName}.`,
        'Accept and Inject',
        'Cancel',
      );

      if (action === 'Accept and Inject') {
        this.lastHandoffMarkdown = markdown;
        await vscode.env.clipboard.writeText(markdown);
        vscode.window.showInformationMessage('Kote: Session handoff accepted and copied to clipboard.');
      }
    } catch (err) {
      vscode.window.showErrorMessage(`Kote: Failed to open handoff preview: ${toMessage(err)}`);
    }
  }

  getActiveHandoffMarkdown(): string | null {
    return this.lastHandoffMarkdown;
  }

  async showHandoffQuickPick(recentSessions: AiSession[]): Promise<void> {
    if (recentSessions.length === 0) {
      vscode.window.showInformationMessage('Kote: No recent AI sessions available for handoff.');
      return;
    }

    interface HandoffItem extends vscode.QuickPickItem {
      session: AiSession;
    }

    const providers = this.getProviders();
    const items: HandoffItem[] = recentSessions
      .filter((s) => s.turns.length >= 1)
      .map((s) => ({
        label: s.title,
        description: providers.get(s.providerId)?.name || s.providerId,
        detail: `Modified: ${new Date(s.timestamp).toLocaleString()}`,
        session: s,
      }));

    const picked = await vscode.window.showQuickPick(items, {
      placeHolder: 'Select a recent session to generate handoff context',
    });

    if (picked) {
      await this.generateAndReviewHandoff(picked.session);
    }
  }
}
