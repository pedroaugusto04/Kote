export type ProjectDecisionItem = {
  id: string;
  noteId: string;
  noteTitle: string;
  notePath: string;
  projectSlug: string;
  sourceChannel: string;
  source?: string;
  occurredAt: string;
  generatedAt?: string | null;
  kind: 'decision' | 'failed_attempt';
  text: string;
  status: 'current' | 'superseded' | 'rejected' | 'deprecated' | string;
  turnRefs: number[];
  files: string[];
  entities: string[];
  provider?: string;
  model?: string;
};

export const PROJECT_DECISION_STATUS_LABELS: Record<string, string> = {
  current: 'Accepted',
  superseded: 'Superseded',
  rejected: 'Rejected',
  deprecated: 'Deprecated',
};

export function getProjectDecisionStatusLabel(status: string): string {
  return PROJECT_DECISION_STATUS_LABELS[status] || status.toUpperCase();
}

export type ProjectDecisionsResponse = {
  ok: true;
  items: ProjectDecisionItem[];
  availableFiles: string[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
    hasNext: boolean;
    hasPrevious: boolean;
  };
};

export type FetchProjectDecisionsParams = {
  page?: number;
  pageSize?: number;
  status?: string;
  file?: string;
  search?: string;
  kind?: 'decision' | 'failed_attempt' | 'all';
};

export type ExportProjectAdrsParams = {
  status?: string;
  file?: string;
  search?: string;
  kind?: 'decision' | 'failed_attempt' | 'all';
};
