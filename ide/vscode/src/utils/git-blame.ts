import * as cp from 'child_process';

export interface GitSnippetCommit {
  commitHash: string;
  author: string;
  commitDate: string;
  commitMessage: string;
}

export interface GitSnippetOriginInfo extends GitSnippetCommit {
  commits: GitSnippetCommit[];
}

export function extractGitSnippetOrigin(
  workspaceRoot: string,
  relativePath: string,
  startLine: number,
  endLine: number
): Promise<GitSnippetOriginInfo | null> {
  return new Promise((resolve) => {
    const sLine = Math.max(1, startLine);
    const eLine = Math.max(sLine, endLine);

    // 1. Primary approach: git blame on the selected range sLine..eLine.
    // This inspects every line currently in the selection, parses all commit metadata,
    // and selects the commit with the newest timestamp (latest line change).
    cp.execFile(
      'git',
      ['blame', '-L', `${sLine},${eLine}`, '--porcelain', relativePath],
      { cwd: workspaceRoot, timeout: 4000 },
      (blameErr, blameStdout) => {
        if (!blameErr && blameStdout && blameStdout.trim()) {
          const lines = blameStdout.split('\n');
          const commits = new Map<
            string,
            { commitHash: string; author: string; commitDate: string; commitMessage: string; timestamp: number }
          >();
          let currentHash = '';

          for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            if (/^[0-9a-f]{40}/.test(line)) {
              currentHash = line.split(' ')[0];
              if (!currentHash.startsWith('00000000') && !commits.has(currentHash)) {
                commits.set(currentHash, {
                  commitHash: currentHash,
                  author: '',
                  commitDate: '',
                  commitMessage: '',
                  timestamp: 0,
                });
              }
            } else if (currentHash && commits.has(currentHash)) {
              const commit = commits.get(currentHash)!;
              if (line.startsWith('author ')) {
                commit.author = line.replace('author ', '').trim();
              } else if (line.startsWith('author-time ')) {
                const ts = parseInt(line.replace('author-time ', '').trim(), 10);
                if (!isNaN(ts)) {
                  commit.timestamp = ts;
                  commit.commitDate = new Date(ts * 1000).toISOString();
                }
              } else if (line.startsWith('summary ')) {
                commit.commitMessage = line.replace('summary ', '').trim();
              }
            }
          }

          const sortedCommits = Array.from(commits.values()).sort((a, b) => b.timestamp - a.timestamp);
          if (sortedCommits.length > 0) {
            const latest = sortedCommits[0];
            const selectedCommits = sortedCommits.slice(0, 20).map(({ timestamp: _timestamp, ...commit }) => commit);
            return resolve({
              commitHash: latest.commitHash,
              author: latest.author,
              commitDate: latest.commitDate,
              commitMessage: latest.commitMessage,
              commits: selectedCommits,
            });
          }
        }

        // 2. Fallback: try git log -L for line evolution history
        cp.execFile(
          'git',
          ['log', '-L', `${sLine},${eLine}:${relativePath}`, '-n', '1', '--format=%H|%an|%aI|%s'],
          { cwd: workspaceRoot, timeout: 4000 },
          (logErr, logStdout) => {
            if (!logErr && logStdout && logStdout.trim()) {
              const firstLine = logStdout.trim().split('\n')[0];
              const parts = firstLine.split('|');
              if (parts.length >= 4) {
                return resolve({
                  commitHash: parts[0]?.trim() || '',
                  author: parts[1]?.trim() || '',
                  commitDate: parts[2]?.trim() || '',
                  commitMessage: parts.slice(3).join('|').trim() || '',
                  commits: [],
                });
              }
            }
            resolve(null);
          }
        );
      }
    );
  });
}
