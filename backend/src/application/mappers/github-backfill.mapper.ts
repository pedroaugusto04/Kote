export interface CommitDiffFile {
  filename: string;
  status: string;
}

export interface BuildPushPayloadInput {
  branch: string;
  parentSha: string;
  commitSha: string;
  installationId: number | string;
  repository: {
    id: number | string;
    fullName: string;
    name: string;
    private?: boolean;
  };
  commitMessage: string;
  commitTimestamp: string;
  commitUrl: string;
  files: CommitDiffFile[];
}

export class GithubBackfillMapper {
  static categorizeFiles(files: CommitDiffFile[]): { added: string[]; modified: string[]; removed: string[] } {
    const added: string[] = [];
    const modified: string[] = [];
    const removed: string[] = [];

    for (const file of files) {
      if (file.status === 'added') {
        added.push(file.filename);
      } else if (file.status === 'modified') {
        modified.push(file.filename);
      } else if (file.status === 'removed') {
        removed.push(file.filename);
      }
    }

    return { added, modified, removed };
  }

  static toPushBody(input: BuildPushPayloadInput) {
    const { added, modified, removed } = this.categorizeFiles(input.files);

    return {
      ref: `refs/heads/${input.branch}`,
      before: input.parentSha,
      after: input.commitSha,
      installation: { id: input.installationId },
      repository: {
        id: input.repository.id,
        full_name: input.repository.fullName,
        name: input.repository.name,
        private: input.repository.private,
      },
      head_commit: {
        id: input.commitSha,
        message: input.commitMessage,
        timestamp: input.commitTimestamp,
        url: input.commitUrl,
      },
      commits: [{
        id: input.commitSha,
        message: input.commitMessage,
        added,
        modified,
        removed,
      }],
      pusher: { name: 'github-backfill' },
      sender: { login: 'github-backfill' },
    };
  }
}
