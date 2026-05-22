import { Injectable } from '@nestjs/common';

import type { ProjectBrief, ProjectBriefAiConfig, ProjectBriefContextItem } from '../../application/models/project-brief.models.js';
import { ProjectBriefAiGateway } from '../../application/ports/project-brief-ai.gateway.js';
import { AiProvider } from '../../contracts/enums.js';
import { runChatCompletion } from './openai-compatible-chat.js';
import { buildProjectBriefPrompt, buildProjectBriefSystemPrompt, parseProjectBrief } from './prompts/project-brief.prompt.js';

@Injectable()
export class DefaultProjectBriefAiGateway extends ProjectBriefAiGateway {
  async generate(
    config: ProjectBriefAiConfig,
    payload: {
      projectSlug: string;
      generatedAt: string;
      contextWindow: number;
      items: ProjectBriefContextItem[];
    },
  ): Promise<ProjectBrief | null> {
    if (config.provider === AiProvider.None || !config.apiKey || !config.model) return null;
    const content = await runChatCompletion(
      config,
      buildProjectBriefSystemPrompt(),
      buildProjectBriefPrompt(payload),
    );
    if (!content) return null;
    return parseProjectBrief(JSON.parse(content), {
      projectSlug: payload.projectSlug,
      generatedAt: payload.generatedAt,
      items: payload.items,
    });
  }
}
