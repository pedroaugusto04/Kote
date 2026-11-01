import type {
  LinkedCommitSummary,
  ListProjectCommitsInput,
  ListProjectCommitsResult,
  SyncGitCommitInput,
} from '../../models/git-commits.models.js';
import type { NoteRecord } from '../../models/repository-records.models.js';

export abstract class GitCommitRepository {
  abstract upsertCommitsAndReconcile(
    userId: string,
    scope: { workspaceId: string; projectId: string },
    commits: SyncGitCommitInput[],
  ): Promise<{ syncedCount: number; linkedCount: number }>;

  abstract reconcileNoteCommits(
    userId: string,
    note: NoteRecord,
    tx?: unknown,
  ): Promise<LinkedCommitSummary[]>;

  abstract listByNoteIds(
    userId: string,
    noteIds: string[],
  ): Promise<Map<string, LinkedCommitSummary[]>>;

  abstract listProjectCommits(
    userId: string,
    input: ListProjectCommitsInput,
  ): Promise<ListProjectCommitsResult>;

  abstract linkNoteCommitManually(
    userId: string,
    noteId: string,
    commitId: string,
  ): Promise<LinkedCommitSummary>;

  abstract unlinkNoteCommit(
    userId: string,
    noteId: string,
    commitId: string,
  ): Promise<boolean>;
}
