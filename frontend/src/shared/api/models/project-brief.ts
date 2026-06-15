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

export type ProjectBriefResponse = {
  ok: true;
  fallback: boolean;
  fallbackReason?: 'generation_failed';
  brief: ProjectBrief;
};

export type SavedProjectBriefResponse = {
  ok: true;
  source: 'history' | 'none';
  brief: ProjectBrief | null;
};

export type ProjectBriefPanelResponse = ProjectBriefResponse | SavedProjectBriefResponse;

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

export type ProjectBriefHistoryResponse = {
  items: ProjectBriefHistoryRecord[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
    hasNext: boolean;
    hasPrevious: boolean;
  };
};
