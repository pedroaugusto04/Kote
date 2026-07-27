import { Injectable } from '@nestjs/common';
import { AppLogger } from '../../../observability/logger.js';
import { RuntimeEnvironmentProvider, type RuntimeEnvironment } from '../../ports/observability/runtime-environment.port.js';
import { FileNotesSummaryCacheService } from '../../services/content/file-notes-summary-cache.service.js';
import { AiOperationType } from '../../../domain/enums/plans.enums.js';
import { AiProvider, IntegrationProvider } from '../../../contracts/enums.js';
import { FileNotesSummaryFallbackReason } from '../../../domain/enums/ai.enums.js';
import { AiEntitlementService } from '../../services/ai/ai-entitlement.service.js';
import {
  buildFileNotesSummaryFallback,
  type FileNotesSummaryRequest,
  type FileNotesSummaryResponse,
} from '../../utils/notes/file-notes-summary.utils.js';

@Injectable()
export class GenerateFileNotesSummaryUseCase {
  private readonly env: RuntimeEnvironment;

  constructor(
    private readonly runtimeEnv: RuntimeEnvironmentProvider,
    private readonly cacheService: FileNotesSummaryCacheService,
    private readonly logger: AppLogger,
    private readonly aiEntitlement: AiEntitlementService,
  ) {
    this.env = this.runtimeEnv.read();
  }

  async execute(
    userId: string,
    request: FileNotesSummaryRequest,
  ): Promise<FileNotesSummaryResponse> {
    this.logger.info('generate_file_notes_summary.start', {
      userId,
      filePath: request.filePath,
      notesCount: request.notes.length,
    });

    if (request.notes.length === 0) {
      this.logger.info('generate_file_notes_summary.no_notes');
      return {
        summary: 'No notes found for this file.',
        understanding: 'There are no engineering notes or decisions recorded for this file yet.',
        timeline: [],
        keyChanges: [],
        generatedAt: new Date().toISOString(),
      };
    }

    const workspaceSlug = request.workspaceSlug || request.notes[0]?.workspaceSlug || 'default';
    const config = {
      conversationAiProvider: this.env.fileNotesSummaryAiProvider,
      conversationAiBaseUrl: this.env.fileNotesSummaryAiBaseUrl,
      conversationAiModel: this.env.fileNotesSummaryAiModel,
      conversationAiApiKey: this.env.fileNotesSummaryAiApiKey,
    };

    if (config.conversationAiProvider === AiProvider.None || !config.conversationAiBaseUrl || !config.conversationAiModel || !config.conversationAiApiKey) {
      return buildFileNotesSummaryFallback(request, FileNotesSummaryFallbackReason.FeatureDisabled);
    }

    // Check cache only after the integration state has been validated.
    const cached = this.cacheService.get(
      request.filePath,
      request.notes.map((n) => ({ id: n.id, date: n.date })),
    );
    if (cached) {
      this.logger.info('generate_file_notes_summary.cache_hit');
      return {
        summary: cached.summary,
        understanding: cached.understanding,
        timeline: cached.timeline,
        keyChanges: cached.keyChanges,
        generatedAt: new Date(cached.cachedAt).toISOString(),
      };
    }

    const entitlement = await this.aiEntitlement.checkAndConsume({
      userId,
      workspaceSlug,
      provider: IntegrationProvider.FileNotesSummaryAi,
      operation: AiOperationType.FILE_NOTES_SUMMARY,
    });
    if (!entitlement.enabled) {
      return buildFileNotesSummaryFallback(request, FileNotesSummaryFallbackReason.FeatureDisabled);
    }

    if (!entitlement.quota.allowed) {
      this.logger.warn('generate_file_notes_summary.quota_exceeded', { userId, workspaceSlug });
      return buildFileNotesSummaryFallback(request, FileNotesSummaryFallbackReason.QuotaExceeded);
    }

    const result = await this.generateSummary(config, request);
    
    // Cache the result
    this.cacheService.set(
      request.filePath,
      request.notes.map((n) => ({ id: n.id, date: n.date })),
      result,
    );
    
    this.logger.info('generate_file_notes_summary.complete', {
      timelineEntries: result.timeline.length,
      keyChanges: result.keyChanges.length,
    });

    return {
      ...result,
      generatedAt: new Date().toISOString(),
    };
  }

  private async generateSummary(
    config: {
      conversationAiProvider: string;
      conversationAiBaseUrl: string;
      conversationAiModel: string;
      conversationAiApiKey: string;
    },
    request: FileNotesSummaryRequest,
  ): Promise<FileNotesSummaryResponse> {
    // Import prompts dynamically to avoid circular dependencies
    const {
      buildFileNotesSummarySystemPrompt,
      buildFileNotesSummaryPrompt,
      parseFileNotesSummaryResponse,
    } = await import('../../../infrastructure/ai/prompts/file-notes-summary.prompt.js');

    const systemPrompt = buildFileNotesSummarySystemPrompt();
    const userContent = buildFileNotesSummaryPrompt(request);

    let content: string | null = null;
    try {
      content = await this.runChatCompletion(config, systemPrompt, userContent);
    } catch (error) {
      this.logger.warn('generate_file_notes_summary.generation_failed', {
        error: error instanceof Error ? error.message : String(error),
      });
      return buildFileNotesSummaryFallback(request, FileNotesSummaryFallbackReason.GenerationFailed);
    }
    if (!content) {
      this.logger.warn('generate_file_notes_summary.generation_failed');
      return buildFileNotesSummaryFallback(request, FileNotesSummaryFallbackReason.GenerationFailed);
    }

    try {
      const parsedJson = JSON.parse(content);
      return parseFileNotesSummaryResponse(parsedJson);
    } catch (error) {
      this.logger.warn('generate_file_notes_summary.parse_failed', {
        error: error instanceof Error ? error.message : String(error),
      });
      return buildFileNotesSummaryFallback(request, FileNotesSummaryFallbackReason.GenerationFailed);
    }
  }

  private async runChatCompletion(
    config: {
      conversationAiProvider: string;
      conversationAiBaseUrl: string;
      conversationAiModel: string;
      conversationAiApiKey: string;
    },
    systemPrompt: string,
    userContent: string,
  ): Promise<string | null> {
    const { runChatCompletion } = await import('../../../infrastructure/ai/openai-compatible-chat.js');
    const { AiProvider } = await import('../../../contracts/enums.js');

    if (config.conversationAiProvider === AiProvider.None || !config.conversationAiApiKey || !config.conversationAiModel) {
      return null;
    }

    return await runChatCompletion(
      {
        provider: config.conversationAiProvider as any,
        baseUrl: config.conversationAiBaseUrl,
        model: config.conversationAiModel,
        apiKey: config.conversationAiApiKey,
      },
      systemPrompt,
      userContent,
    );
  }

}
