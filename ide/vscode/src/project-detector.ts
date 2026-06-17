import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import * as vscode from 'vscode';
import type { KbClient, KbProject } from './kb-client';
import { toUrlSlug } from './utils/text.js';

/**
 * Tries to detect which KB project corresponds to the currently open workspace.
 *
 * Priority:
 *   1. `.kb-sync.json` in workspace root — has an explicit `defaultProject` field
 *   2. Git remote URL slug matched against known KB projects
 *   3. Workspace folder name matched against KB project slugs
 *   4. Falls back to `config.defaultProjectSlug`
 */
export async function detectActiveProject(
  client: KbClient,
  folders: readonly vscode.WorkspaceFolder[],
): Promise<string | null> {
  let projects: KbProject[] = [];
  try {
    projects = await client.listProjects();
  } catch {
    // Can't reach API — return config default
    return client.defaultProjectSlug || null;
  }

  for (const folder of folders) {
    const root = folder.uri.fsPath;

    // 1. .kb-sync.json
    const syncPath = path.join(root, '.kb-sync.json');
    if (fs.existsSync(syncPath)) {
      try {
        const sync = JSON.parse(fs.readFileSync(syncPath, 'utf8'));
        if (sync.defaultProject) return sync.defaultProject as string;
      } catch { /* ignore */ }
    }

    // 2. Git remote origin
    try {
      const remoteUrl = execSync('git remote get-url origin', {
        cwd: root,
        stdio: ['ignore', 'pipe', 'ignore'],
      })
        .toString()
        .trim();

      const repoName = remoteUrl
        .split('/')
        .pop()
        ?.replace(/\.git$/, '');

      if (repoName) {
        const slug = toUrlSlug(repoName);
        const match = projects.find(
          (p) => p.projectSlug === slug || toUrlSlug(p.displayName) === slug,
        );
        if (match) return match.projectSlug;
      }
    } catch { /* no git or no remote */ }

    // 3. Folder name
    const folderName = toUrlSlug(path.basename(root));
    const byFolder = projects.find((p) => p.projectSlug === folderName);
    if (byFolder) return byFolder.projectSlug;
  }

  return client.defaultProjectSlug || (projects[0]?.projectSlug ?? null);
}
