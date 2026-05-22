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
