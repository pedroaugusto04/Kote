import { Injectable } from '@nestjs/common';

import { ContentRepository } from '../../ports/notes/content.repository.js';
import { AppLogger } from '../../../observability/logger.js';
import { AnswerGenerationGateway, type AnswerContextChunk } from '../../ports/query/answer-generation.gateway.js';
import { RuntimeEnvironmentProvider, type RuntimeEnvironment } from '../../ports/observability/runtime-environment.port.js';
import type { NoteRecord } from '../../models/repository-records.models.js';
import { QuotaService } from '../../services/quota.service.js';
import { FileNotesSummaryCacheService } from '../../services/file-notes-summary-cache.service.js';
import { AiOperationType } from '../../../domain/enums/plans.enums.js';
import { QuotaExceededException } from '../../../interfaces/http/quota-exceeded.exception.js';

type FileNotesSummaryRequest = {
  filePath: string;
  notes: Array<{
    id: string;
    title: string;
    date: string;
    content: string;
    summary?: string;
  }>;
};

type FileNotesSummaryResponse = {
  summary: string;
  understanding: string;
  timeline: Array<{
    date: string;
    title: string;
    description: string;
    noteId: string;
  }>;
  keyChanges: Array<{
    description: string;
    noteId: string;
  }>;
  generatedAt: string;
};

@Injectable()
export class GenerateFileNotesSummaryUseCase {
  private readonly env: RuntimeEnvironment;

  constructor(
    private readonly runtimeEnv: RuntimeEnvironmentProvider,
    private readonly quotaService: QuotaService,
    private readonly cacheService: FileNotesSummaryCacheService,
    private readonly logger: AppLogger,
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

    // Check cache first
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

    const quotaResult = await this.quotaService.checkAndIncrementAiUsage(
      userId,
      AiOperationType.FILE_NOTES_SUMMARY,
    );
    if (!quotaResult.allowed) {
      throw new QuotaExceededException('ai_credits', quotaResult.limit, quotaResult.current);
    }

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

    const config = {
      conversationAiProvider: this.env.fileNotesSummaryAiProvider,
      conversationAiBaseUrl: this.env.fileNotesSummaryAiBaseUrl,
      conversationAiModel: this.env.fileNotesSummaryAiModel,
      conversationAiApiKey: this.env.fileNotesSummaryAiApiKey,
    };

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

    const content = await this.runChatCompletion(config, systemPrompt, userContent);
    if (!content) {
      this.logger.warn('generate_file_notes_summary.generation_failed');
      return this.buildFallbackSummary(request);
    }

    try {
      const parsedJson = JSON.parse(content);
      return parseFileNotesSummaryResponse(parsedJson);
    } catch (error) {
      this.logger.warn('generate_file_notes_summary.parse_failed', {
        error: error instanceof Error ? error.message : String(error),
      });
      return this.buildFallbackSummary(request);
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

  private buildFallbackSummary(request: FileNotesSummaryRequest): FileNotesSummaryResponse {
    const sortedNotes = [...request.notes].sort((a, b) => 
      new Date(a.date).getTime() - new Date(b.date).getTime()
    );

    return {
      summary: `Found ${request.notes.length} note${request.notes.length === 1 ? '' : 's'} about this file.`,
      understanding: 'AI summary generation failed. Showing raw notes below.',
      timeline: sortedNotes.map((note) => ({
        date: new Date(note.date).toISOString().split('T')[0],
        title: note.title || 'Untitled',
        description: note.summary || note.content?.substring(0, 200) || 'No description',
        noteId: note.id,
      })),
      keyChanges: sortedNotes.map((note) => ({
        description: note.title || 'Note entry',
        noteId: note.id,
      })),
      generatedAt: new Date().toISOString(),
    };
  }
}
