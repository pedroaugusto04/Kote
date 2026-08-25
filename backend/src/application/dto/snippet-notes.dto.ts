import type { VaultNoteSummary } from '../models/vault-note.models.js';
import type { CodeLineageCategory } from '../models/code-lineage.models.js';

export interface GitCommitContext {
  commitHash?: string;
  commitHashes?: string[];
  author?: string;
  commitDate?: string;
  commitMessage?: string;
}

export interface FindNotesBySnippetInput {
  filePath: string;
  codeSnippet?: string;
  gitContext?: GitCommitContext;
  projectSlug?: string;
  workspaceSlug?: string;
  limit?: number;
}

export interface SnippetRelevance {
  category: CodeLineageCategory;
  score: number;
  contentScore: number;
  temporalScore?: number;
  isOriginMatch: boolean;
  reason: string;
}

export interface SnippetNoteMatch {
  note: VaultNoteSummary;
  relevance: SnippetRelevance;
}

export interface SnippetNotesResponse {
  ok: boolean;
  filePath: string;
  gitContext?: GitCommitContext;
  matches: SnippetNoteMatch[];
  total: number;
}
