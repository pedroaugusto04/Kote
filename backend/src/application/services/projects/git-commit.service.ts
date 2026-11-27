import { Injectable } from '@nestjs/common';
import { GitCommitRepository } from '../../ports/projects/git-commit.repository.js';
import type {
  LinkedCommitSummary,
  ListProjectCommitsInput,
  ListProjectCommitsResult,
  SyncGitCommitInput,
} from '../../models/git-commits.models.js';

@Injectable()
export class GitCommitService {
  constructor(private readonly gitCommitRepository: GitCommitRepository) {}

  linkCommitToNote(userId: string, noteId: string, commitId: string): Promise<LinkedCommitSummary> {
    return this.gitCommitRepository.linkNoteCommitManually(userId, noteId, commitId);
  }

  unlinkCommitFromNote(userId: string, noteId: string, commitId: string): Promise<boolean> {
    return this.gitCommitRepository.unlinkNoteCommit(userId, noteId, commitId);
  }

  listProjectCommits(userId: string, input: ListProjectCommitsInput): Promise<ListProjectCommitsResult> {
    return this.gitCommitRepository.listProjectCommits(userId, input);
  }

  syncProjectCommits(
    userId: string,
    scope: { workspaceId: string; projectId: string },
    commits: SyncGitCommitInput[],
  ) {
    return this.gitCommitRepository.upsertCommitsAndReconcile(userId, scope, commits);
  }
}
