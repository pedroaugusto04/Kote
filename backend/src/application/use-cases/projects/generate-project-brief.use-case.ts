import { Injectable } from '@nestjs/common';
import { AiProvider, IntegrationProvider } from '../../../contracts/enums.js';
import {
  AiNotConfiguredException,
  AppErrorCode,
  ProjectBriefGenerationFailedException,
} from '../../../domain/exceptions/index.js';
import { ProjectBriefFallbackReason} from '../../models/project-brief.models.js';
import { ContentRepository } from '../../ports/notes/content.repository.js';
import { ProjectBriefAiGateway } from '../../ports/projects/project-brief-ai.gateway.js';
import { ProjectBriefHistoryRepository } from '../../ports/projects/project-brief-history.repository.js';
import { RuntimeEnvironmentProvider } from '../../ports/observability/runtime-environment.port.js';
import { AiOperationType } from '../../../domain/enums/plans.enums.js';
import { isDependencyNote } from '../../../domain/utils/note-embedding.utils.js';
import { AiEntitlementService } from '../../services/ai/ai-entitlement.service.js';
import {
  toEmptyProjectBrief,
  toNormalizedBrief,
  toProjectBriefContextItem,
  toProjectBriefHistorySaveInput,
  toSha256,
} from '../../mappers/project-brief.mapper.js';
import { WorkspaceScopeResolver } from '../../services/content/workspace-scope-resolver.service.js';
import { NoteSynthesisRepository } from '../../ports/notes/note-synthesis.repository.js';
import { SourceChannel } from '../../../domain/enums/knowledge.enums.js';
import {
  formatSynthesisForRetrieval,
  isSynthesisFresh,
} from '../../services/content/ai-session-synthesis-transcript.service.js';


const CONTEXT_WINDOW = 30;

@Injectable()
export class GenerateProjectBriefUseCase {
  constructor(
    private readonly contentRepository: ContentRepository,
    private readonly historyRepository: ProjectBriefHistoryRepository,
    private readonly aiGateway: ProjectBriefAiGateway,
    private readonly environmentProvider: RuntimeEnvironmentProvider,
    private readonly aiEntitlement: AiEntitlementService,
    private readonly scopeResolver: WorkspaceScopeResolver,
    private readonly synthesisRepository: NoteSynthesisRepository,
  ) {}

  async execute(userId: string, projectId: string, workspaceIdInput?: string) {
    const { isAll, projectSlug, workspaceId, workspaceSlug } = await this.scopeResolver.resolveProjectBriefScope(
      userId,
      projectId,
      workspaceIdInput,
    );

    const config = this.aiConfig();
    await this.aiEntitlement.requireAndConsume({
      userId,
      workspaceSlug,
      provider: IntegrationProvider.ProjectBriefAi,
      operation: AiOperationType.PROJECT_BRIEF,
      metadata: { projectSlug, workspaceSlug, source: 'project_brief_generation' },
    });

    const generatedAt = new Date().toISOString();
    const candidateNotes = (await this.contentRepository.listNotes(userId, {
      workspaceId,
      projectId: isAll ? undefined : projectId,
    }))
      .filter((note) => !isDependencyNote(note) && note.workspaceId === workspaceId && (isAll || (note.projectId && note.projectId === projectId)))
      .sort((left, right) => right.occurredAt.localeCompare(left.occurredAt) || left.title.localeCompare(right.title))
      .slice(0, CONTEXT_WINDOW);

    const aiChatNotes = candidateNotes.filter(
      (note) => note.sourceChannel === SourceChannel.AiChat || note.source === SourceChannel.AiChat,
    );

    const synthesisMap = aiChatNotes.length > 0
      ? await this.synthesisRepository.getByNoteIds(userId, aiChatNotes.map((n) => n.id))
      : new Map();

    const enrichedNotes = candidateNotes.map((note) => {
      if (note.sourceChannel !== SourceChannel.AiChat && note.source !== SourceChannel.AiChat) return note;
      const synthesis = synthesisMap.get(note.id);
      if (!isSynthesisFresh(synthesis, note.markdown)) return note;
      return { ...note, summary: synthesis.overview, metadata: { ...note.metadata, rawText: formatSynthesisForRetrieval(synthesis.overview, synthesis.memory) } };
    });
    const items = enrichedNotes.map(toProjectBriefContextItem);
    const contextHash = toSha256(JSON.stringify(items));
    const historyContext = {
      userId,
      projectId: isAll ? undefined : projectId,
      workspaceId,
      contextHash,
      contextWindow: CONTEXT_WINDOW,
      config,
    };

    if (items.length === 0) {
      const brief = toEmptyProjectBrief(projectSlug, generatedAt);
      await this.historyRepository.save(toProjectBriefHistorySaveInput(brief, historyContext));
      return { ok: true as const, fallback: false, brief };
    }

    try {
      const brief = await this.aiGateway.generate(config, {
        projectSlug,
        generatedAt,
        contextWindow: CONTEXT_WINDOW,
        items,
      });
      if (!brief) throw new Error('project_brief_generation_empty');
      const normalized = toNormalizedBrief(brief, projectSlug, generatedAt, items);
      await this.historyRepository.save(toProjectBriefHistorySaveInput(normalized, historyContext));
      return { ok: true as const, fallback: false, brief: normalized };
    } catch (error) {
      console.error('Project brief generation failed:', error);
      const latest = await this.historyRepository.findLatest({
        userId,
        projectId: isAll ? undefined : projectId,
        workspaceId,
      });
      if (latest) {
        return {
          ok: true as const,
          fallback: true,
          fallbackReason: ProjectBriefFallbackReason.GenerationFailed,
          brief: latest.brief,
        };
      }
      throw new ProjectBriefGenerationFailedException(error);
    }
  }

  private aiConfig() {
    const environment = this.environmentProvider.read();
    const config = {
      provider: environment.projectBriefAiProvider,
      baseUrl: environment.projectBriefAiBaseUrl,
      model: environment.projectBriefAiModel,
      apiKey: environment.projectBriefAiApiKey,
    };
    if (config.provider === AiProvider.None || !config.baseUrl || !config.model || !config.apiKey) {
      throw new AiNotConfiguredException(AppErrorCode.ProjectBriefAiNotConfigured);
    }
    return config;
  }

}
