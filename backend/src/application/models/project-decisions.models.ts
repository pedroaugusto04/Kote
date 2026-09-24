import type { SynthesisItemKind, SynthesisItemStatus } from './note-synthesis.models.js';

export const PROJECT_DECISION_STATUS_LABELS: Record<string, string> = {
  current: 'Accepted',
  superseded: 'Superseded',
  rejected: 'Rejected',
  deprecated: 'Deprecated',
};

export function getProjectDecisionStatusLabel(status: string): string {
  return PROJECT_DECISION_STATUS_LABELS[status] || status.toUpperCase();
}

export interface ProjectDecisionItem {
  id: string;
  noteId: string;
  noteTitle: string;
  notePath: string;
  projectSlug: string;
  sourceChannel: string;
  source?: string;
  occurredAt: string;
  generatedAt?: string | null;
  kind: Extract<SynthesisItemKind, 'decision' | 'failed_attempt'>;
  text: string;
  status: SynthesisItemStatus;
  turnRefs: number[];
  files: string[];
  entities: string[];
  provider?: string;
  model?: string;
}

export interface ListProjectDecisionsInput {
  projectSlug: string;
  status?: string;
  file?: string;
  search?: string;
  kind?: 'decision' | 'failed_attempt' | 'all';
  page?: number;
  pageSize?: number;
}

export interface ListProjectDecisionsResult {
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
}
