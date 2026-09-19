import { Injectable } from '@nestjs/common';
import { ContentRepository } from '../../ports/notes/content.repository.js';
import { isNoteAiUsage, AI_ANALYTICS_DEFAULTS } from '../../../domain/ai-usage.js';
import { AppLogger } from '../../../observability/logger.js';
import type {
  AiTokenAnalyticsFilters,
  AiTokenAnalyticsResponse,
  DailyTokenPoint,
  ModelUsageShare,
  ProviderUsageShare,
} from '../../models/ai-token-analytics.models.js';

@Injectable()
export class GetAiTokenAnalyticsUseCase {
  constructor(
    private readonly contentRepository: ContentRepository,
    private readonly logger?: AppLogger,
  ) {}

  async execute(
    userId: string,
    filters?: AiTokenAnalyticsFilters
  ): Promise<AiTokenAnalyticsResponse> {
    const notes = await this.contentRepository.listNotes(userId, {
      workspaceId: filters?.workspaceId,
      projectId: filters?.projectId,
    });

    const availableModelsSet = new Set<string>();
    const availableProvidersSet = new Set<string>();

    // First pass: collect all available models and providers from workspace/project AI notes
    for (const note of notes) {
      const usage = isNoteAiUsage(note.metadata?.aiUsage) ? note.metadata.aiUsage : undefined;
      if (!usage || usage.totalTokens <= 0) {
        continue;
      }
      const model = (usage.model || AI_ANALYTICS_DEFAULTS.UNKNOWN_MODEL).trim();
      const provider = (usage.provider || note.source || AI_ANALYTICS_DEFAULTS.DEFAULT_PROVIDER).trim();
      availableModelsSet.add(model);
      availableProvidersSet.add(provider);
    }

    const targetModel = filters?.model?.trim().toLowerCase();
    const targetProvider = filters?.provider?.trim().toLowerCase();
    const startDate = filters?.startDate ? filters.startDate.slice(0, 10) : undefined;
    const endDate = filters?.endDate ? filters.endDate.slice(0, 10) : undefined;

    let totalTokens = 0;
    let totalInputTokens = 0;
    let totalOutputTokens = 0;
    let totalEstimatedCostUsd = 0;
    let totalAiSessions = 0;

    const modelMap = new Map<
      string,
      {
        totalTokens: number;
        estimatedCostUsd: number;
        sessionCount: number;
        rates?: { inputPerMillion: number; outputPerMillion: number };
      }
    >();
    const providerMap = new Map<string, { totalTokens: number; estimatedCostUsd: number; sessionCount: number }>();
    const dailyMap = new Map<string, { totalTokens: number; estimatedCostUsd: number; sessionCount: number }>();

    for (const note of notes) {
      const usage = isNoteAiUsage(note.metadata?.aiUsage) ? note.metadata.aiUsage : undefined;
      if (!usage || usage.totalTokens <= 0) {
        continue;
      }

      const model = (usage.model || AI_ANALYTICS_DEFAULTS.UNKNOWN_MODEL).trim();
      const provider = (usage.provider || note.source || AI_ANALYTICS_DEFAULTS.DEFAULT_PROVIDER).trim();
      const dateStr = (note.occurredAt || note.createdAt || new Date().toISOString()).slice(0, 10);

      // Model filter
      if (targetModel && model.toLowerCase() !== targetModel) {
        continue;
      }

      // Provider filter
      if (targetProvider && provider.toLowerCase() !== targetProvider) {
        continue;
      }

      // Date range filters (inclusive)
      if (startDate && dateStr < startDate) {
        continue;
      }
      if (endDate && dateStr > endDate) {
        continue;
      }

      totalAiSessions += 1;
      const tokens = usage.totalTokens;
      const input = usage.inputTokens || 0;
      const output = usage.outputTokens || 0;
      const cost = typeof usage.estimatedCostUsd === 'number' ? usage.estimatedCostUsd : 0;

      totalTokens += tokens;
      totalInputTokens += input;
      totalOutputTokens += output;
      totalEstimatedCostUsd += cost;

      // Model aggregation
      const currentModel = modelMap.get(model) || { totalTokens: 0, estimatedCostUsd: 0, sessionCount: 0 };
      currentModel.totalTokens += tokens;
      currentModel.estimatedCostUsd += cost;
      currentModel.sessionCount += 1;
      if (!currentModel.rates && usage.rates) {
        currentModel.rates = usage.rates;
      }
      modelMap.set(model, currentModel);

      // Provider aggregation
      const currentProvider = providerMap.get(provider) || { totalTokens: 0, estimatedCostUsd: 0, sessionCount: 0 };
      currentProvider.totalTokens += tokens;
      currentProvider.estimatedCostUsd += cost;
      currentProvider.sessionCount += 1;
      providerMap.set(provider, currentProvider);

      // Daily aggregation
      const currentDay = dailyMap.get(dateStr) || { totalTokens: 0, estimatedCostUsd: 0, sessionCount: 0 };
      currentDay.totalTokens += tokens;
      currentDay.estimatedCostUsd += cost;
      currentDay.sessionCount += 1;
      dailyMap.set(dateStr, currentDay);
    }

    const byModel: ModelUsageShare[] = Array.from(modelMap.entries())
      .map(([model, data]) => ({
        model,
        totalTokens: data.totalTokens,
        estimatedCostUsd: Number(data.estimatedCostUsd.toFixed(4)),
        sessionCount: data.sessionCount,
        percentage: totalTokens > 0 ? Number(((data.totalTokens / totalTokens) * 100).toFixed(1)) : 0,
        rates: data.rates,
      }))
      .sort((a, b) => b.totalTokens - a.totalTokens);

    const byProvider: ProviderUsageShare[] = Array.from(providerMap.entries())
      .map(([provider, data]) => ({
        provider,
        totalTokens: data.totalTokens,
        estimatedCostUsd: Number(data.estimatedCostUsd.toFixed(4)),
        sessionCount: data.sessionCount,
        percentage: totalTokens > 0 ? Number(((data.totalTokens / totalTokens) * 100).toFixed(1)) : 0,
      }))
      .sort((a, b) => b.totalTokens - a.totalTokens);

    const dailyTrend: DailyTokenPoint[] = Array.from(dailyMap.entries())
      .map(([date, data]) => ({
        date,
        totalTokens: data.totalTokens,
        estimatedCostUsd: Number(data.estimatedCostUsd.toFixed(4)),
        sessionCount: data.sessionCount,
      }))
      .sort((a, b) => a.date.localeCompare(b.date));

    const result: AiTokenAnalyticsResponse = {
      totalTokens,
      totalInputTokens,
      totalOutputTokens,
      totalEstimatedCostUsd: Number(totalEstimatedCostUsd.toFixed(4)),
      totalAiSessions,
      topModel: byModel[0]?.model || AI_ANALYTICS_DEFAULTS.NONE_MODEL,
      byModel,
      byProvider,
      dailyTrend,
      availableModels: Array.from(availableModelsSet).sort(),
      availableProviders: Array.from(availableProvidersSet).sort(),
    };

    this.logger?.info('ai.token_analytics.computed', {
      userId,
      workspaceId: filters?.workspaceId,
      projectId: filters?.projectId,
      totalScannedNotes: notes.length,
      totalAiSessions,
      totalTokens,
      totalEstimatedCostUsd: result.totalEstimatedCostUsd,
      topModel: result.topModel,
    });

    return result;
  }
}
