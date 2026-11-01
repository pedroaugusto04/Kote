import type { PaginationMeta } from './pagination';

export type CommitLinkSource = 'ai_terminal' | 'session_files' | 'github_push' | 'manual';

export type LinkedCommitSummary = {
  id: string;
  commitSha: string;
  shortSha: string;
  message: string;
  authorName: string;
  committedAt: string;
  branch: string | null;
  htmlUrl: string | null;
  linkSource: CommitLinkSource;
  confidence: number;
  matchedFiles: string[];
};

export type LinkedCommitNoteSummary = {
  noteId: string;
  title: string;
  summary: string;
  source: string;
  sourceChannel: string;
  occurredAt: string;
  linkSource: CommitLinkSource;
  confidence: number;
  matchedFiles: string[];
};

export type ProjectCommitItem = {
  id: string;
  projectId: string;
  projectSlug?: string;
  projectName?: string;
  commitSha: string;
  shortSha: string;
  message: string;
  authorName: string;
  authorEmail: string;
  committedAt: string;
  branch: string | null;
  changedFiles: string[];
  htmlUrl: string | null;
  linkedNotes: LinkedCommitNoteSummary[];
};

export type ProjectCommitsResponse = {
  ok: true;
  commits: ProjectCommitItem[];
  pagination: PaginationMeta;
};

export type ProjectCommitLinkFilter = 'all' | 'with_notes' | 'ai' | 'manual' | 'github_push';

export type FetchProjectCommitsParams = {
  page?: number;
  pageSize?: number;
  onlyLinked?: boolean;
  linkFilter?: ProjectCommitLinkFilter;
  query?: string;
};
