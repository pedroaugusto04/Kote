import { BadRequestException, Injectable, NotFoundException, ServiceUnavailableException } from '@nestjs/common';

import { AiProvider, CredentialRecordStatus, IntegrationProvider } from '../../../contracts/enums.js';
import { ProjectBriefFallbackReason, type ProjectBrief, type ProjectBriefContextItem } from '../../models/project-brief.models.js';
import { ContentRepository } from '../../ports/notes/content.repository.js';
import { CredentialRepository } from '../../ports/integrations/integrations.repository.js';
import { ProjectBriefAiGateway } from '../../ports/projects/project-brief-ai.gateway.js';
import { ProjectBriefHistoryRepository } from '../../ports/projects/project-brief-history.repository.js';
import { RuntimeEnvironmentProvider } from '../../ports/observability/runtime-environment.port.js';
import { QuotaService } from '../../services/quota/quota.service.js';
import { AiOperationType } from '../../../domain/enums/plans.enums.js';
import { QuotaExceededException } from '../../../interfaces/http/quota-exceeded.exception.js';
import { toProjectBriefContextItem, toEmptyProjectBrief, toNormalizedBrief, toSha256 } from '../../mappers/project-brief.mapper.js';


const CONTEXT_WINDOW = 30;

@Injectable()
export class GenerateProjectBriefUseCase {
  constructor(
    private readonly contentRepository: ContentRepository,
    private readonly credentialRepository: CredentialRepository,
    private readonly historyRepository: ProjectBriefHistoryRepository,
    private readonly aiGateway: ProjectBriefAiGateway,
    private readonly environmentProvider: RuntimeEnvironmentProvider,
    private readonly quotaService: QuotaService,
  ) {}

  async execute(userId: string, projectId: string) {
    let workspaceSlug = '';
    let workspaceId = '';
    let isAll = false;
    let projectSlug = '';

    if (projectId === 'all') {
      isAll = true;
      projectSlug = 'all';
      const workspaces = await this.contentRepository.listWorkspaces(userId);
      if (workspaces.length > 0) {
        workspaceSlug = workspaces[0].workspaceSlug;
        workspaceId = workspaces[0].id;
      } else {
        throw new NotFoundException('workspace_not_found');
      }
    } else {
      const project = await this.contentRepository.getProjectById(userId, projectId);
      if (!project || !project.enabled) throw new NotFoundException('project_not_found');
      workspaceSlug = project.workspaceSlug || '';
      workspaceId = project.workspaceId || '';
      projectSlug = project.projectSlug;
    }

    const config = this.aiConfig();
    await this.requireConnectedIntegration(userId, workspaceSlug);

    // Check AI credit quota before calling the LLM
    const quotaResult = await this.quotaService.checkAndIncrementAiUsage(
      userId,
      AiOperationType.PROJECT_BRIEF,
      { projectSlug, workspaceSlug, source: 'project_brief_generation' },
    );
    if (!quotaResult.allowed) {
      throw new QuotaExceededException('ai_credits', quotaResult.limit, quotaResult.current);
    }

    const generatedAt = new Date().toISOString();
    const items = (await this.contentRepository.listNotes(userId))
      .filter((note) => note.workspaceId === workspaceId && (isAll || (note.projectId && note.projectId === projectId)))
      .sort((left, right) => right.occurredAt.localeCompare(left.occurredAt) || left.title.localeCompare(right.title))
      .slice(0, CONTEXT_WINDOW)
      .map(toProjectBriefContextItem);
    const contextHash = toSha256(JSON.stringify(items));

    if (items.length === 0) {
      const brief = toEmptyProjectBrief(projectSlug, generatedAt);
      await this.historyRepository.save({
        userId,
        projectId: isAll ? undefined : projectId,
        workspaceId,
        brief,
        sourceRefs: brief.sources,
        contextHash,
        contextWindow: CONTEXT_WINDOW,
        provider: config.provider,
        model: config.model,
      });
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
      await this.historyRepository.save({
        userId,
        projectId: isAll ? undefined : projectId,
        workspaceId,
        brief: normalized,
        sourceRefs: normalized.sources,
        contextHash,
        contextWindow: CONTEXT_WINDOW,
        provider: config.provider,
        model: config.model,
      });
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
      throw new ServiceUnavailableException('project_brief_generation_failed');
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
      throw new BadRequestException('project_brief_ai_not_configured');
    }
    return config;
  }

  private async requireConnectedIntegration(userId: string, workspaceSlug: string) {
    const credential = await this.credentialRepository.findCredential(userId, workspaceSlug, IntegrationProvider.ProjectBriefAi);
    if (!credential || credential.status !== CredentialRecordStatus.Connected || credential.revokedAt) {
      throw new BadRequestException('project_brief_ai_not_connected');
    }
  }
}
