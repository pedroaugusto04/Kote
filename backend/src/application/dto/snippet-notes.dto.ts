import type { VaultNoteSummary } from '../models/vault-note.models.js';

export interface GitCommitContext {
  commitHash?: string;
  author?: string;
  commitDate?: string;
  commitMessage?: string;
}

export interface FindNotesBySnippetInput {
  filePath: string;
  codeSnippet?: string;
  gitContext?: GitCommitContext;
  limit?: number;
}

export interface SnippetRelevance {
  score: number;
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
