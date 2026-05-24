import type { ProjectBrief, ProjectBriefAiConfig, ProjectBriefContextItem } from '../../models/project-brief.models.js';

export abstract class ProjectBriefAiGateway {
  abstract generate(
    config: ProjectBriefAiConfig,
    payload: {
      projectSlug: string;
      generatedAt: string;
      contextWindow: number;
      items: ProjectBriefContextItem[];
    },
  ): Promise<ProjectBrief | null>;
}
