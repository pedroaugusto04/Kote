import { Injectable } from '@nestjs/common';
import { ContentRepository } from '../../ports/notes/content.repository.js';
import { isNoteAiUsage, AI_ANALYTICS_DEFAULTS, type NoteAiUsage, type ModelUsageDetail } from '../../../domain/ai-usage.js';
import { AppLogger } from '../../../observability/logger.js';
import type {
  AiTokenAnalyticsFilters,
  AiTokenAnalyticsResponse,
  DailyTokenPoint,
  ModelUsageShare,
  ProviderUsageShare,
} from '../../models/ai-token-analytics.models.js';

function getModelUsages(usage: NoteAiUsage, defaultSource?: string): ModelUsageDetail[] {
  if (Array.isArray(usage.byModel) && usage.byModel.length > 0) {
    return usage.byModel;
  }
  return [
    {
      model: (usage.model || AI_ANALYTICS_DEFAULTS.UNKNOWN_MODEL).trim(),
      provider: (usage.provider || defaultSource || AI_ANALYTICS_DEFAULTS.DEFAULT_PROVIDER).trim(),
      inputTokens: usage.inputTokens || 0,
      outputTokens: usage.outputTokens || 0,
      totalTokens: usage.totalTokens,
      estimatedCostUsd: typeof usage.estimatedCostUsd === 'number' ? usage.estimatedCostUsd : 0,
      rates: usage.rates,
    },
  ];
}

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
    const availableProjectsSet = new Set<string>();

    // First pass: collect all available models, providers, and projects from workspace/project AI notes
    for (const note of notes) {
      if (note.projectSlug) {
        availableProjectsSet.add(note.projectSlug);
      }
      const usage = isNoteAiUsage(note.metadata?.aiUsage) ? note.metadata.aiUsage : undefined;
      if (!usage || usage.totalTokens <= 0) continue;

      for (const m of getModelUsages(usage, note.source)) {
        if (m.model) availableModelsSet.add(m.model.trim());
        if (m.provider) availableProvidersSet.add(m.provider.trim());
      }
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
      if (!usage || usage.totalTokens <= 0) continue;

      const dateStr = (note.occurredAt || note.createdAt || new Date().toISOString()).slice(0, 10);
      if (startDate && dateStr < startDate) continue;
      if (endDate && dateStr > endDate) continue;

      const modelUsages = getModelUsages(usage, note.source);

      // Check if this session matches the provider/model filter
      if (targetProvider) {
        const matches = modelUsages.some((m) => (m.provider || '').toLowerCase() === targetProvider);
        if (!matches) continue;
      }
      if (targetModel) {
        const matches = modelUsages.some((m) => m.model.toLowerCase() === targetModel);
        if (!matches) continue;
      }

      let noteTokens = 0;
      let noteInputTokens = 0;
      let noteOutputTokens = 0;
      let noteCost = 0;

      for (const m of modelUsages) {
        const mModel = (m.model || AI_ANALYTICS_DEFAULTS.UNKNOWN_MODEL).trim();
        const mProvider = (m.provider || note.source || AI_ANALYTICS_DEFAULTS.DEFAULT_PROVIDER).trim();

        if (targetModel && mModel.toLowerCase() !== targetModel) continue;
        if (targetProvider && mProvider.toLowerCase() !== targetProvider) continue;

        const mTokens = m.totalTokens;
        const mInput = m.inputTokens || 0;
        const mOutput = m.outputTokens || 0;
        const mCost = typeof m.estimatedCostUsd === 'number' ? m.estimatedCostUsd : 0;

        noteTokens += mTokens;
        noteInputTokens += mInput;
        noteOutputTokens += mOutput;
        noteCost += mCost;

        // Model aggregation
        const currentModel = modelMap.get(mModel) || { totalTokens: 0, estimatedCostUsd: 0, sessionCount: 0 };
        currentModel.totalTokens += mTokens;
        currentModel.estimatedCostUsd += mCost;
        currentModel.sessionCount += 1;
        if (!currentModel.rates && m.rates) {
          currentModel.rates = m.rates;
        }
        modelMap.set(mModel, currentModel);

        // Provider aggregation
        const currentProvider = providerMap.get(mProvider) || { totalTokens: 0, estimatedCostUsd: 0, sessionCount: 0 };
        currentProvider.totalTokens += mTokens;
        currentProvider.estimatedCostUsd += mCost;
        currentProvider.sessionCount += 1;
        providerMap.set(mProvider, currentProvider);
      }

      if (noteTokens > 0) {
        totalAiSessions += 1;
        totalTokens += noteTokens;
        totalInputTokens += noteInputTokens;
        totalOutputTokens += noteOutputTokens;
        totalEstimatedCostUsd += noteCost;

        // Daily aggregation
        const currentDay = dailyMap.get(dateStr) || { totalTokens: 0, estimatedCostUsd: 0, sessionCount: 0 };
        currentDay.totalTokens += noteTokens;
        currentDay.estimatedCostUsd += noteCost;
        currentDay.sessionCount += 1;
        dailyMap.set(dateStr, currentDay);
      }
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
      availableProjects: Array.from(availableProjectsSet).sort(),
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
