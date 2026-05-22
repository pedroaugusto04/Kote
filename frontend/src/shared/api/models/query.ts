import type { PaginationMeta } from './pagination';
import type { NoteStatus } from './note-status';

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
    tags: string[];
    date: string;
    status: NoteStatus;
    summary: string;
    source: string;
    projectSlug: string;
    score: number;
    snippet: string;
  }>;
};
