import crypto from 'node:crypto';

import { BadRequestException, Injectable, NotFoundException, ServiceUnavailableException } from '@nestjs/common';

import { CredentialRecordStatus, IntegrationProvider } from '../../../contracts/enums.js';
import type { NoteRecord } from '../../models/repository-records.models.js';
import type { ProjectBrief, ProjectBriefContextItem } from '../../models/project-brief.models.js';
import { ContentRepository } from '../../ports/notes/content.repository.js';
import { CredentialRepository } from '../../ports/integrations/integrations.repository.js';
import { ProjectBriefAiGateway } from '../../ports/projects/project-brief-ai.gateway.js';
import { ProjectBriefHistoryRepository } from '../../ports/projects/project-brief-history.repository.js';
import { RuntimeEnvironmentProvider } from '../../ports/observability/runtime-environment.port.js';
import { resolveCanonicalTypeFromCategories } from '../../../domain/note-classification.js';


const CONTEXT_WINDOW = 30;
const RAW_TEXT_LIMIT = 2_000;

@Injectable()
export class GenerateProjectBriefUseCase {
  constructor(
    private readonly contentRepository: ContentRepository,
    private readonly credentialRepository: CredentialRepository,
    private readonly historyRepository: ProjectBriefHistoryRepository,
    private readonly aiGateway: ProjectBriefAiGateway,
    private readonly environmentProvider: RuntimeEnvironmentProvider,
  ) {}

  async execute(userId: string, projectSlug: string) {
    let workspaceSlug = '';
    let isAll = false;

    if (projectSlug === 'all') {
      isAll = true;
      const workspaces = await this.contentRepository.listWorkspaces(userId);
      if (workspaces.length > 0) {
        workspaceSlug = workspaces[0].workspaceSlug;
      } else {
        throw new NotFoundException('workspace_not_found');
      }
    } else {
      const project = await this.contentRepository.getProjectBySlug(userId, projectSlug);
      if (!project || !project.enabled) throw new NotFoundException('project_not_found');
      workspaceSlug = project.workspaceSlug || '';
    }

    const config = this.aiConfig();
    await this.requireConnectedIntegration(userId, workspaceSlug);

    const generatedAt = new Date().toISOString();
    const items = (await this.contentRepository.listNotes(userId))
      .filter((note) => note.workspaceSlug === workspaceSlug && (isAll || note.projectSlug === projectSlug))
      .sort((left, right) => right.occurredAt.localeCompare(left.occurredAt) || left.title.localeCompare(right.title))
      .slice(0, CONTEXT_WINDOW)
      .map(toContextItem);
    const contextHash = sha256(JSON.stringify(items));

    if (items.length === 0) {
      const brief = emptyProjectBrief(projectSlug, generatedAt);
      await this.historyRepository.save({
        userId,
        workspaceSlug,
        projectSlug,
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
      const normalized = normalizeBrief(brief, projectSlug, generatedAt, items);
      await this.historyRepository.save({
        userId,
        workspaceSlug,
        projectSlug,
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
        workspaceSlug,
        projectSlug,
      });
      if (latest) {
        return {
          ok: true as const,
          fallback: true,
          fallbackReason: 'generation_failed' as const,
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
    if (config.provider === 'none' || !config.baseUrl || !config.model || !config.apiKey) {
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

function toContextItem(note: NoteRecord): ProjectBriefContextItem {
  return {
    noteId: note.id,
    title: note.title,
    summary: note.summary,
    type: resolveCanonicalTypeFromCategories(note.categories || [], (note.categories || []).map((c) => c.id)),
    status: note.status,
    sourceChannel: note.sourceChannel,
    tags: note.tags,
    date: note.occurredAt,
    path: note.path,
    rawText: truncate(String(note.metadata.rawText || ''), RAW_TEXT_LIMIT),
  };
}

function truncate(value: string, maxLength: number) {
  return value.length > maxLength ? `${value.slice(0, maxLength)}...` : value;
}

function sha256(value: string) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function emptyProjectBrief(projectSlug: string, generatedAt: string): ProjectBrief {
  return {
    projectSlug,
    generatedAt,
    summary: 'No recent project items were found in the current context window.',
    status: 'No recent activity available.',
    recentChanges: [],
    decisions: [],
    openItems: [],
    risks: [],
    nextSteps: ['Capture project notes, decisions, or operational events before generating the next brief.'],
    sources: [],
  };
}

function normalizeBrief(brief: ProjectBrief, projectSlug: string, generatedAt: string, items: ProjectBriefContextItem[]): ProjectBrief {
  const allowedSources = new Map(items.map((item) => [item.noteId, item]));
  return {
    projectSlug,
    generatedAt,
    summary: String(brief.summary || '').trim(),
    status: String(brief.status || '').trim(),
    recentChanges: stringList(brief.recentChanges),
    decisions: stringList(brief.decisions),
    openItems: stringList(brief.openItems),
    risks: stringList(brief.risks),
    nextSteps: stringList(brief.nextSteps),
    sources: (brief.sources || [])
      .filter((source) => allowedSources.has(source.noteId))
      .map((source) => {
        const original = allowedSources.get(source.noteId);
        return {
          noteId: source.noteId,
          title: source.title || original?.title || '',
          path: source.path || original?.path || '',
          date: source.date || original?.date || '',
        };
      }),
  };
}

function stringList(value: unknown): string[] {
  return Array.isArray(value) ? value.map((item) => String(item || '').trim()).filter(Boolean) : [];
}
