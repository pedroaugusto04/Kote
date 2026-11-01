import type { PaginationMeta } from './pagination.models.js';

export const COMMIT_LINK_SOURCES = {
  AI_TERMINAL: 'ai_terminal',
  SESSION_FILES: 'session_files',
  GITHUB_PUSH: 'github_push',
  MANUAL: 'manual',
} as const;

export type CommitLinkSource = (typeof COMMIT_LINK_SOURCES)[keyof typeof COMMIT_LINK_SOURCES];

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

export type SyncGitCommitCandidateLink = {
  source?: string;
  sessionId?: string;
  noteId?: string;
  linkSource?: CommitLinkSource;
  confidence?: number;
  matchedFiles?: string[];
};

export type SyncGitCommitInput = {
  commitSha: string;
  shortSha?: string;
  message?: string;
  authorName?: string;
  authorEmail?: string;
  committedAt: string;
  branch?: string | null;
  parentShas?: string[];
  changedFiles?: string[];
  htmlUrl?: string | null;
  metadata?: Record<string, unknown>;
  candidateSessionLinks?: SyncGitCommitCandidateLink[];
};

export type ListProjectCommitsInput = {
  workspaceId?: string;
  projectId?: string | null;
  page: number;
  pageSize: number;
  onlyLinked?: boolean;
  query?: string;
};

export type ListProjectCommitsResult = {
  items: ProjectCommitItem[];
  pagination: PaginationMeta;
};
