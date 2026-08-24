import * as cp from 'child_process';

export interface GitSnippetOriginInfo {
  commitHash: string;
  author: string;
  commitDate: string;
  commitMessage: string;
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

    // Try git log -L first
    cp.execFile(
      'git',
      ['log', `-L`, `${sLine},${eLine}:${relativePath}`, '-n', '1', '--format=%H|%an|%aI|%s'],
      { cwd: workspaceRoot, timeout: 4000 },
      (err, stdout) => {
        if (!err && stdout && stdout.trim()) {
          const firstLine = stdout.trim().split('\n')[0];
          const parts = firstLine.split('|');
          if (parts.length >= 4) {
            return resolve({
              commitHash: parts[0]?.trim() || '',
              author: parts[1]?.trim() || '',
              commitDate: parts[2]?.trim() || '',
              commitMessage: parts.slice(3).join('|').trim() || '',
            });
          }
        }

        // Fallback: try git blame -L on the first selected line
        cp.execFile(
          'git',
          ['blame', `-L`, `${sLine},${sLine}`, '--porcelain', relativePath],
          { cwd: workspaceRoot, timeout: 4000 },
          (blameErr, blameStdout) => {
            if (blameErr || !blameStdout || !blameStdout.trim()) {
              return resolve(null);
            }

            const lines = blameStdout.split('\n');
            const header = lines[0]?.split(' ') || [];
            const commitHash = header[0] || '';

            if (!commitHash || commitHash.startsWith('00000000')) {
              // Not yet committed locally
              return resolve(null);
            }

            let author = '';
            let commitDate = '';
            let commitMessage = '';

            for (const line of lines) {
              if (line.startsWith('author ')) {
                author = line.replace('author ', '').trim();
              } else if (line.startsWith('author-time ')) {
                const timestamp = parseInt(line.replace('author-time ', '').trim(), 10);
                if (!isNaN(timestamp)) {
                  commitDate = new Date(timestamp * 1000).toISOString();
                }
              } else if (line.startsWith('summary ')) {
                commitMessage = line.replace('summary ', '').trim();
              }
            }

            resolve({
              commitHash,
              author,
              commitDate,
              commitMessage,
            });
          }
        );
      }
    );
  });
}
