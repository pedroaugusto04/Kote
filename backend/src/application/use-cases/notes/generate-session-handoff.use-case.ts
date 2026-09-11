import crypto from 'node:crypto';
import { Injectable, NotFoundException } from '@nestjs/common';

import { AppLogger } from '../../../observability/logger.js';
import { RuntimeEnvironmentProvider, type RuntimeEnvironment } from '../../ports/observability/runtime-environment.port.js';
import { ContentRepository } from '../../ports/notes/content.repository.js';
import { AiEntitlementService } from '../../services/ai/ai-entitlement.service.js';
import { IntegrationProvider } from '../../../contracts/enums.js';
import { SourceChannel } from '../../../domain/enums/knowledge.enums.js';
import { AiOperationType } from '../../../domain/enums/plans.enums.js';
import { runChatCompletion, type ChatConfig } from '../../../infrastructure/ai/openai-compatible-chat.js';
import {
  buildSessionHandoffSystemPrompt,
  buildSessionHandoffUserPrompt,
} from '../../../infrastructure/ai/prompts/session-handoff.prompt.js';
import type { SessionHandoffBody, SessionHandoffResponse } from '../../../interfaces/http/dto/session-handoff.dto.js';

type CachedHandoff = {
  markdown: string;
  sourceProvider?: string;
  sourceNoteId?: string;
  sourceTitle?: string;
  sourceTimestamp?: string;
  cachedAt: number;
};

const CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes

@Injectable()
export class GenerateSessionHandoffUseCase {
  private readonly env: RuntimeEnvironment;
  private readonly memoryCache = new Map<string, CachedHandoff>();

  constructor(
    private readonly runtimeEnv: RuntimeEnvironmentProvider,
    private readonly contentRepository: ContentRepository,
    private readonly aiEntitlement: AiEntitlementService,
    private readonly logger: AppLogger,
  ) {
    this.env = this.runtimeEnv.read();
  }

  async execute(userId: string, input: SessionHandoffBody): Promise<SessionHandoffResponse> {
    const workspaceSlug = input.workspaceSlug || 'default';
    this.logger.info('session_handoff.start', {
      userId,
      provider: input.provider,
      projectSlug: input.projectSlug,
      hasRawText: Boolean(input.rawText),
      noteId: input.noteId,
    });

    let transcript = String(input.rawText || '').trim();
    let sourceProvider = input.provider;
    let sourceNoteId = input.noteId;
    let sourceTitle: string | undefined;
    let sourceTimestamp: string | undefined;

    // 1. If no raw text provided, fetch note by ID or detect latest session note
    if (!transcript) {
      if (input.noteId) {
        const note = await this.contentRepository.getNoteById(userId, input.noteId);
        if (!note) {
          throw new NotFoundException('note_not_found');
        }
        transcript = String(note.markdown || note.summary || '').trim();
        sourceProvider = note.source || 'ai-session';
        sourceTitle = note.title;
        sourceTimestamp = note.occurredAt || note.createdAt;
      } else if (input.autoDetectPrevious) {
        const detected = await this.findLatestSessionNote(userId, input.provider, input.projectSlug);
        if (detected) {
          transcript = String(detected.markdown || detected.summary || '').trim();
          sourceProvider = detected.source || 'ai-session';
          sourceNoteId = detected.id;
          sourceTitle = detected.title;
          sourceTimestamp = detected.occurredAt || detected.createdAt;
        }
      }
    }

    if (!transcript) {
      return {
        ok: true,
        handoffMarkdown: '# [Kote] Session Handoff\n\nNo previous session content found to generate handoff.',
        sourceProvider,
        cached: false,
      };
    }

    // 2. Check memory cache by content hash
    const contentHash = crypto.createHash('sha256').update(`${sourceProvider}:${transcript}`).digest('hex');
    const cached = this.memoryCache.get(contentHash);
    const now = Date.now();
    if (cached && (now - cached.cachedAt) < CACHE_TTL_MS) {
      this.logger.info('session_handoff.cache_hit', { userId, contentHash });
      return {
        ok: true,
        handoffMarkdown: cached.markdown,
        sourceProvider: cached.sourceProvider,
        sourceNoteId: cached.sourceNoteId,
        sourceTitle: cached.sourceTitle,
        sourceTimestamp: cached.sourceTimestamp,
        cached: true,
      };
    }

    // 3. Check entitlement and consume AI credits
    const entitlement = await this.aiEntitlement.checkAndConsume({
      userId,
      workspaceSlug,
      provider: IntegrationProvider.AiSessionSynthesis,
      operation: AiOperationType.SESSION_HANDOFF,
      metadata: { projectSlug: input.projectSlug, sourceProvider },
    });

    if (!entitlement.enabled || !entitlement.quota.allowed) {
      this.logger.warn('session_handoff.quota_or_disabled', {
        userId,
        enabled: entitlement.enabled,
        allowed: entitlement.enabled ? entitlement.quota.allowed : false,
      });

      return {
        ok: true,
        handoffMarkdown: `# [Kote] Session Handoff\n\nUnable to generate AI handoff: ${!entitlement.enabled ? 'AI session synthesis integration is not enabled.' : 'Monthly AI credits quota exceeded.'}\n\nRecent transcript excerpt:\n\n${transcript.slice(0, 1500)}...`,
        sourceProvider,
        sourceNoteId,
        sourceTitle,
        sourceTimestamp,
        cached: false,
      };
    }

    // 4. Resolve AI configuration
    const config: ChatConfig = {
      provider: this.env.aiSessionSynthesisProvider || this.env.defaultChatAiProvider,
      baseUrl: this.env.aiSessionSynthesisBaseUrl || this.env.defaultChatAiBaseUrl,
      model: this.env.aiSessionSynthesisModel || this.env.defaultChatAiModel,
      apiKey: this.env.aiSessionSynthesisApiKey || this.env.defaultChatAiApiKey,
      responseFormat: { type: 'text' },
    };

    const systemPrompt = buildSessionHandoffSystemPrompt();
    const userPrompt = buildSessionHandoffUserPrompt({
      provider: sourceProvider,
      transcript: transcript.length > 50000 ? `${transcript.slice(0, 50000)}\n\n[Transcript truncated for handoff]` : transcript,
      projectSlug: input.projectSlug,
    });

    // 5. Generate completion
    let handoffMarkdown: string;
    try {
      handoffMarkdown = await runChatCompletion(config, systemPrompt, userPrompt);
      if (!handoffMarkdown.trim()) {
        handoffMarkdown = `# [Kote] Session Handoff\n\nNo structured handoff could be generated for this session.\n\n${transcript.slice(0, 1000)}`;
      }
    } catch (error) {
      this.logger.error('session_handoff.generation_failed', {
        userId,
        error: error instanceof Error ? error.message : String(error),
      });
      handoffMarkdown = `# [Kote] Session Handoff\n\nAI generation failed. Raw summary of previous session:\n\n${transcript.slice(0, 1500)}`;
    }

    // 6. Cache result
    this.memoryCache.set(contentHash, {
      markdown: handoffMarkdown,
      sourceProvider,
      sourceNoteId,
      sourceTitle,
      sourceTimestamp,
      cachedAt: now,
    });

    // Enforce cache size limit
    if (this.memoryCache.size > 200) {
      const oldestKey = this.memoryCache.keys().next().value;
      if (oldestKey) this.memoryCache.delete(oldestKey);
    }

    this.logger.info('session_handoff.completed', {
      userId,
      sourceProvider,
      sourceNoteId,
      length: handoffMarkdown.length,
    });

    return {
      ok: true,
      handoffMarkdown,
      sourceProvider,
      sourceNoteId,
      sourceTitle,
      sourceTimestamp,
      cached: false,
    };
  }

  private async findLatestSessionNote(userId: string, currentProvider: string, projectSlug?: string) {
    const allNotes = await this.contentRepository.listNotes(userId);
    const aiNotes = allNotes
      .filter((n) => n.sourceChannel === SourceChannel.AiChat || n.source === SourceChannel.AiChat || (n.sessionId && n.sessionId.length > 0))
      .filter((n) => !projectSlug || n.projectSlug === projectSlug)
      .sort((a, b) => {
        const timeA = new Date(a.occurredAt || a.createdAt || 0).getTime();
        const timeB = new Date(b.occurredAt || b.createdAt || 0).getTime();
        return timeB - timeA;
      });

    if (aiNotes.length === 0) return null;

    // Prefer a note from a different provider if available, otherwise latest AI note
    const differentProviderNote = aiNotes.find((n) => n.source && n.source !== currentProvider);
    return differentProviderNote || aiNotes[0];
  }
}
