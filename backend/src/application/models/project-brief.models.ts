import type { AiProvider } from '../../contracts/enums.js';

export enum ProjectBriefSavedSource {
  History = 'history',
  None = 'none',
}

export enum ProjectBriefFallbackReason {
  GenerationFailed = 'generation_failed',
}

export type ProjectBriefSource = {
  noteId: string;
  title: string;
  path: string;
  date: string;
};

export type ProjectBrief = {
  projectSlug: string;
  generatedAt: string;
  summary: string;
  status: string;
  recentChanges: string[];
  decisions: string[];
  openItems: string[];
  risks: string[];
  nextSteps: string[];
  sources: ProjectBriefSource[];
};

export type ProjectBriefContextItem = {
  noteId: string;
  title: string;
  summary: string;
  type: string;
  status: string;
  sourceChannel: string;
  tags: string[];
  date: string;
  path: string;
  rawText: string;
};

export type ProjectBriefAiConfig = {
  provider: AiProvider;
  baseUrl: string;
  model: string;
  apiKey: string;
};

export type ProjectBriefHistoryRecord = {
  id: string;
  userId: string;
  workspaceSlug: string;
  projectSlug: string;
  brief: ProjectBrief;
  sourceRefs: ProjectBriefSource[];
  contextHash: string;
  contextWindow: number;
  provider: string;
  model: string;
  generatedAt: string;
  createdAt: string;
};

export type SaveProjectBriefHistoryInput = {
  userId: string;
  workspaceSlug: string;
  projectSlug: string;
  brief: ProjectBrief;
  sourceRefs: ProjectBriefSource[];
  contextHash: string;
  contextWindow: number;
  provider: string;
  model: string;
};
