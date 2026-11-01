import type { PaginationMeta } from './pagination';
import type { NoteStatus } from './note-status';
import type { CategoryRecord } from './category';
import type { LinkedCommitSummary } from './project-commits';

export type QueryResponse = {
  ok: boolean;
  query: string;
  pagination: PaginationMeta;
  matches: Array<{
    id: string;
    path: string;
    title: string;
    type: string;
    project: string;
    workspace: string;
    folderId: string | null;
    categories: CategoryRecord[];
    tags: string[];
    date: string;
    status: NoteStatus;
    summary: string;
    source: string;
    projectSlug: string;
    score: number;
    snippet: string;
    attachmentCount?: number;
    isPinned?: boolean;
    linkedCommits?: LinkedCommitSummary[];
  }>;
};
