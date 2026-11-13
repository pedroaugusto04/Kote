import { execFile } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { promisify } from 'node:util';
import * as vscode from 'vscode';

import type { AiHistoryManager } from '../ai-history/history-manager';
import { isConfigured, type KbClient } from '../kb-client';
import { SPECIAL_PROJECT_SLUGS } from '../utils/project';
import { watchFile } from '../utils/watcher';

const execFileAsync = promisify(execFile);

const COMMIT_RECORD_START = '___KOTE_COMMIT_START___';
const COMMIT_HEADER_END = '___KOTE_HEADER_END___';
const SYNC_DEBOUNCE_MS = 2500;
const RECENT_COMMITS_COUNT = 15;
const RECENT_SESSION_WINDOW_MS = 6 * 60 * 60 * 1000;

interface ParsedLocalCommit {
  commitSha: string;
  shortSha: string;
  parentShas: string[];
  authorName: string;
  authorEmail: string;
  committedAt: string;
  message: string;
  branch: string | null;
  changedFiles: string[];
}

function normalizePath(p: string): string {
  return p.trim().replace(/\\/g, '/').replace(/^\/+/, '');
}

function filesOverlap(commitFiles: string[], sessionFiles: string[]): string[] {
  const matched = new Set<string>();
  for (const cf of commitFiles) {
    const normCf = normalizePath(cf);
    if (!normCf) continue;
    for (const sf of sessionFiles) {
      const normSf = normalizePath(sf);
      if (!normSf) continue;
      if (normCf === normSf) {
        matched.add(normCf);
        continue;
      }
      const [shorter, longer] = normCf.length < normSf.length ? [normCf, normSf] : [normSf, normCf];
      if (shorter.includes('/') && longer.endsWith(`/${shorter}`)) {
        matched.add(normCf);
      }
    }
  }
  return [...matched];
}

async function resolveGitBranch(repoDir: string): Promise<string | null> {
  try {
    const { stdout } = await execFileAsync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], {
      cwd: repoDir,
      timeout: 3000,
    });
    const branch = stdout.trim();
    return branch && branch !== 'HEAD' ? branch : null;
  } catch {
    return null;
  }
}

async function resolveGithubRepoBaseUrl(repoDir: string): Promise<string | null> {
  try {
    const { stdout } = await execFileAsync('git', ['remote', 'get-url', 'origin'], {
      cwd: repoDir,
      timeout: 3000,
    });
    const raw = stdout.trim();
    const sshMatch = raw.match(/git@github\.com:([^/]+\/[^.\s]+)(?:\.git)?$/i);
    if (sshMatch) return `https://github.com/${sshMatch[1]}`;
    const httpsMatch = raw.match(/https?:\/\/github\.com\/([^/]+\/[^.\s]+?)(?:\.git)?$/i);
    if (httpsMatch) return `https://github.com/${httpsMatch[1]}`;
    return null;
  } catch {
    return null;
  }
}

async function readRecentGitCommits(repoDir: string, limit = RECENT_COMMITS_COUNT): Promise<ParsedLocalCommit[]> {
  const branch = await resolveGitBranch(repoDir);
  const format = `${COMMIT_RECORD_START}%H%n%h%n%P%n%an%n%ae%n%aI%n%s${COMMIT_HEADER_END}`;
  const { stdout } = await execFileAsync(
    'git',
    ['log', `-n`, String(limit), `--pretty=format:${format}`, '--name-only'],
    { cwd: repoDir, timeout: 6000, maxBuffer: 2 * 1024 * 1024 },
  );

  const commits: ParsedLocalCommit[] = [];
  const blocks = stdout.split(COMMIT_RECORD_START).map((b) => b.trim()).filter(Boolean);

  for (const block of blocks) {
    const [headerPart, filesPart = ''] = block.split(COMMIT_HEADER_END);
    if (!headerPart) continue;
    const headerLines = headerPart.split('\n');
    if (headerLines.length < 7) continue;

    const commitSha = (headerLines[0] || '').trim().toLowerCase();
    const shortSha = (headerLines[1] || '').trim().toLowerCase() || commitSha.slice(0, 7);
    const parentShas = (headerLines[2] || '').trim().split(/\s+/).filter(Boolean);
    const authorName = (headerLines[3] || '').trim();
    const authorEmail = (headerLines[4] || '').trim();
    const committedAt = (headerLines[5] || '').trim();
    const message = (headerLines.slice(6).join(' ') || '').trim();

    if (!commitSha) continue;

    const changedFiles = filesPart
      .split('\n')
      .map((line) => normalizePath(line))
      .filter(Boolean);

    commits.push({
      commitSha,
      shortSha,
      parentShas,
      authorName,
      authorEmail,
      committedAt,
      message,
      branch,
      changedFiles: [...new Set(changedFiles)],
    });
  }

  return commits;
}

export class GitCommitTracker implements vscode.Disposable {
  private readonly disposables: vscode.Disposable[] = [];
  private readonly lastSyncedHeadByFolder = new Map<string, string>();
  private syncTimeout?: NodeJS.Timeout;

  constructor(
    private readonly client: KbClient,
    private readonly historyManager: AiHistoryManager,
    private readonly getActiveProjectSlug: () => string,
  ) {}

  start(): void {
    this.setupWatchers();

    // Initial silent sync after extension startup
    this.scheduleSync(3500);

    const workspaceWatcher = vscode.workspace.onDidChangeWorkspaceFolders(() => {
      this.setupWatchers();
      this.scheduleSync();
    });
    this.disposables.push(workspaceWatcher);
  }

  private setupWatchers(): void {
    const folders = vscode.workspace.workspaceFolders ?? [];
    for (const folder of folders) {
      const gitDir = path.join(folder.uri.fsPath, '.git');
      if (!fs.existsSync(gitDir)) continue;

      const headLogPath = path.join(gitDir, 'logs', 'HEAD');
      const headPath = path.join(gitDir, 'HEAD');

      if (fs.existsSync(headLogPath)) {
        this.disposables.push(watchFile(headLogPath, () => this.scheduleSync()));
      }
      if (fs.existsSync(headPath)) {
        this.disposables.push(watchFile(headPath, () => this.scheduleSync()));
      }
    }
  }

  scheduleSync(delayMs = SYNC_DEBOUNCE_MS): void {
    if (this.syncTimeout) clearTimeout(this.syncTimeout);
    this.syncTimeout = setTimeout(() => {
      this.syncTimeout = undefined;
      void this.syncAllWorkspaceFolders();
    }, delayMs);
  }

  private async syncAllWorkspaceFolders(): Promise<void> {
    if (!isConfigured()) return;

    const isGitTrackingEnabled = vscode.workspace
      .getConfiguration('kote')
      .get<boolean>('gitTracking.enabled', true);
    if (!isGitTrackingEnabled) return;

    const projectSlug = this.getActiveProjectSlug();
    if (!projectSlug || projectSlug === SPECIAL_PROJECT_SLUGS.INBOX || projectSlug === 'all') {
      return;
    }

    const folders = vscode.workspace.workspaceFolders ?? [];
    for (const folder of folders) {
      const repoDir = folder.uri.fsPath;
      if (!fs.existsSync(path.join(repoDir, '.git'))) continue;

      try {
        const commits = await readRecentGitCommits(repoDir);
        if (commits.length === 0) continue;

        const headSha = commits[0].commitSha;
        const recentSessions = this.historyManager.getRecentSessionsList();
        const sessionSig = recentSessions
          .slice(0, 5)
          .map((s) => `${s.providerId}:${s.sessionId}:${(s.gitActivity?.touchedFiles || []).length}`)
          .join('|');
        const syncKey = `${projectSlug}:${headSha}:${sessionSig}`;

        if (this.lastSyncedHeadByFolder.get(repoDir) === syncKey) {
          continue;
        }

        const githubBaseUrl = await resolveGithubRepoBaseUrl(repoDir);

        // Process commits from oldest to newest so session file changes are consumed by the first commit after the session
        const chronologicalCommits = [...commits].reverse();
        const consumedSessions = new Set<string>();

        const payload = chronologicalCommits.map((commit) => {
          const commitTimeMs = Date.parse(commit.committedAt) || Date.now();
          const candidateSessionLinks: Array<{
            source?: string;
            sessionId?: string;
            linkSource?: 'ai_terminal' | 'session_files';
            confidence?: number;
            matchedFiles?: string[];
          }> = [];

          for (const session of recentSessions) {
            const sessionKey = `${session.providerId}:${session.sessionId}`;
            const createdShas = session.gitActivity?.createdCommitShas || [];
            const isDirectCommit = createdShas.some(
              (sha) => commit.commitSha.startsWith(sha) || sha.startsWith(commit.commitSha),
            );
            const touchedFiles = session.gitActivity?.touchedFiles || [];
            const matchedFiles = filesOverlap(commit.changedFiles, touchedFiles);

            if (isDirectCommit) {
              consumedSessions.add(sessionKey);
              candidateSessionLinks.push({
                source: session.providerId,
                sessionId: session.sessionId,
                linkSource: 'ai_terminal',
                confidence: 100,
                matchedFiles: matchedFiles.length > 0 ? matchedFiles : commit.changedFiles,
              });
              continue;
            }

            // If this session explicitly created a different commit SHA in terminal, do not heuristically match it to other commits
            if (createdShas.length > 0 || consumedSessions.has(sessionKey)) {
              continue;
            }

            const timeDiffMs = commitTimeMs - session.timestamp;
            const withinSessionWindow = timeDiffMs >= -15 * 60 * 1000 && timeDiffMs <= RECENT_SESSION_WINDOW_MS;
            if (withinSessionWindow && matchedFiles.length > 0) {
              consumedSessions.add(sessionKey);
              candidateSessionLinks.push({
                source: session.providerId,
                sessionId: session.sessionId,
                linkSource: 'session_files',
                confidence: Math.min(95, 70 + matchedFiles.length * 10),
                matchedFiles,
              });
            }
          }

          return {
            commitSha: commit.commitSha,
            shortSha: commit.shortSha,
            message: commit.message,
            authorName: commit.authorName,
            authorEmail: commit.authorEmail,
            committedAt: commit.committedAt,
            branch: commit.branch,
            parentShas: commit.parentShas,
            changedFiles: commit.changedFiles,
            htmlUrl: githubBaseUrl ? `${githubBaseUrl}/commit/${commit.commitSha}` : null,
            ...(candidateSessionLinks.length > 0 ? { candidateSessionLinks } : {}),
          };
        });

        await this.client.syncProjectCommits(projectSlug, payload);
        this.lastSyncedHeadByFolder.set(repoDir, syncKey);
      } catch {
        // Silent background operation — never interrupt user workflow
      }
    }
  }

  dispose(): void {
    if (this.syncTimeout) clearTimeout(this.syncTimeout);
    for (const d of this.disposables) {
      d.dispose();
    }
  }
}
