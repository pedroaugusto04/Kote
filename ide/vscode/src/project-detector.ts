import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import * as vscode from 'vscode';
import type { KbClient, KbProject } from './kb-client';
import { toUrlSlug } from './utils/text.js';

/**
 * Normalizes a git remote URL to extract repo and owner/repo names.
 */
export function extractGitRepoInfo(remoteUrl: string): { fullName?: string; repoName?: string } {
  let clean = remoteUrl.trim().replace(/\.git$/, '');
  const match = clean.match(/(?:[:/])([a-zA-Z0-9_.-]+)\/([a-zA-Z0-9_.-]+)$/);
  if (match) {
    return {
      fullName: `${match[1]}/${match[2]}`.toLowerCase(),
      repoName: match[2].toLowerCase(),
    };
  }
  const single = clean.split('/').pop()?.split(':').pop();
  if (single) {
    return { repoName: single.toLowerCase() };
  }
  return {};
}

/**
 * Finds the git root directory by walking up from dirPath.
 */
export function findGitRoot(dirPath: string): string | null {
  let curr = path.resolve(dirPath);
  while (curr && curr !== path.dirname(curr)) {
    if (fs.existsSync(path.join(curr, '.git'))) {
      return curr;
    }
    curr = path.dirname(curr);
  }
  return null;
}

/**
 * Reads git remote url from git command or .git/config file.
 */
export function getGitRemoteUrl(dirPath: string): string | null {
  // 1. Try execSync git remote get-url origin
  try {
    const url = execSync('git remote get-url origin', {
      cwd: dirPath,
      stdio: ['ignore', 'pipe', 'ignore'],
    })
      .toString()
      .trim();
    if (url) return url;
  } catch {
    // ignore
  }

  // 2. Direct read of .git/config (including walking up to git root)
  try {
    const gitRoot = findGitRoot(dirPath) || dirPath;
    let gitConfigPath = path.join(gitRoot, '.git', 'config');
    if (!fs.existsSync(gitConfigPath)) {
      const gitFile = path.join(gitRoot, '.git');
      if (fs.existsSync(gitFile) && fs.statSync(gitFile).isFile()) {
        const gitFileContent = fs.readFileSync(gitFile, 'utf8');
        const gitDirMatch = gitFileContent.match(/gitdir:\s*(.+)/);
        if (gitDirMatch) {
          const resolvedGitDir = path.resolve(gitRoot, gitDirMatch[1].trim());
          gitConfigPath = path.join(resolvedGitDir, 'config');
        }
      }
    }

    if (fs.existsSync(gitConfigPath)) {
      const content = fs.readFileSync(gitConfigPath, 'utf8');
      const match = content.match(/\[remote\s+"origin"\][\s\S]*?url\s*=\s*([^\r\n]+)/);
      if (match) {
        return match[1].trim();
      }
    }
  } catch {
    // ignore
  }

  return null;
}

/**
 * Reads project/package name from standard project manifests (package.json, pyproject.toml, Cargo.toml, go.mod).
 */
export function extractProjectNameFromManifest(dirPath: string): string | null {
  if (!dirPath || !fs.existsSync(dirPath)) return null;

  // 1. package.json
  try {
    const pkgPath = path.join(dirPath, 'package.json');
    if (fs.existsSync(pkgPath)) {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
      if (pkg.name && typeof pkg.name === 'string') {
        const rawName = pkg.name.trim();
        const cleanName = rawName.includes('/') ? rawName.split('/').pop()! : rawName;
        return cleanName;
      }
    }
  } catch { /* ignore */ }

  // 2. pyproject.toml
  try {
    const pyprojectPath = path.join(dirPath, 'pyproject.toml');
    if (fs.existsSync(pyprojectPath)) {
      const content = fs.readFileSync(pyprojectPath, 'utf8');
      const match = content.match(/name\s*=\s*["']([^"']+)["']/);
      if (match) return match[1].trim();
    }
  } catch { /* ignore */ }

  // 3. Cargo.toml
  try {
    const cargoPath = path.join(dirPath, 'Cargo.toml');
    if (fs.existsSync(cargoPath)) {
      const content = fs.readFileSync(cargoPath, 'utf8');
      const match = content.match(/name\s*=\s*["']([^"']+)["']/);
      if (match) return match[1].trim();
    }
  } catch { /* ignore */ }

  // 4. go.mod
  try {
    const goModPath = path.join(dirPath, 'go.mod');
    if (fs.existsSync(goModPath)) {
      const content = fs.readFileSync(goModPath, 'utf8');
      const match = content.match(/^module\s+([^\r\n]+)/m);
      if (match) {
        const fullMod = match[1].trim();
        return fullMod.split('/').pop() || fullMod;
      }
    }
  } catch { /* ignore */ }

  return null;
}

/**
 * Tries to detect which KB project corresponds to a given directory path.
 *
 * Priority:
 *   1. .kb-sync.json in dir or parents
 *   2. Local manifest (package.json, pyproject.toml, Cargo.toml, go.mod)
 *   3. Monorepo subfolder name matching
 *   4. Git remote URL slug or linked repository in Kote
 *   5. Root directory name
 */
export function detectProjectFromPath(
  root: string,
  projects: KbProject[],
): string | null {
  if (!root || !fs.existsSync(root)) return null;

  const resolvedRoot = path.resolve(root);
  const gitRoot = findGitRoot(resolvedRoot);

  // Helper matcher against projects list
  const matchSlugOrName = (candidate: string | null | undefined): string | null => {
    if (!candidate) return null;
    const slug = toUrlSlug(candidate);
    if (!slug) return null;
    const match = projects.find(
      (p) => (p.projectSlug && p.projectSlug.toLowerCase() === slug) || (p.displayName && toUrlSlug(p.displayName) === slug),
    );
    return match ? match.projectSlug : null;
  };

  // 1. .kb-sync.json (check local first, then git root)
  const syncCandidates = [
    path.join(resolvedRoot, '.kb-sync.json'),
    ...(gitRoot && gitRoot !== resolvedRoot ? [path.join(gitRoot, '.kb-sync.json')] : []),
  ];
  for (const syncPath of syncCandidates) {
    if (fs.existsSync(syncPath)) {
      try {
        const sync = JSON.parse(fs.readFileSync(syncPath, 'utf8'));
        if (sync.defaultProject) return sync.defaultProject as string;
      } catch { /* ignore */ }
    }
  }

  // 2. Local manifest (package.json, pyproject.toml, etc. in local folder)
  const localManifestName = extractProjectNameFromManifest(resolvedRoot);
  const matchedFromManifest = matchSlugOrName(localManifestName);
  if (matchedFromManifest) return matchedFromManifest;

  // 3. Monorepo subfolder name (if inside git subfolder)
  if (gitRoot && gitRoot !== resolvedRoot) {
    const subfolderName = path.basename(resolvedRoot);
    const matchedSubfolder = matchSlugOrName(subfolderName);
    if (matchedSubfolder) return matchedSubfolder;
  }

  // 4. Git remote origin (matched against connected repositories, repoName, or owner/repo)
  const remoteUrl = getGitRemoteUrl(resolvedRoot);
  if (remoteUrl) {
    const { fullName, repoName } = extractGitRepoInfo(remoteUrl);

    for (const p of projects) {
      const pRepos = (p as any).repositories;
      if (Array.isArray(pRepos)) {
        const repos = pRepos
          .map((r: any) => {
            if (typeof r === 'string') return r.toLowerCase();
            if (r && typeof r === 'object') {
              const val = r.fullName || r.full_name || r.name || r.externalId || '';
              return typeof val === 'string' ? val.toLowerCase() : '';
            }
            return '';
          })
          .filter(Boolean);
        if (fullName && repos.includes(fullName)) return p.projectSlug;
        if (repoName && repos.some((r: string) => r === repoName || r.endsWith(`/${repoName}`))) {
          return p.projectSlug;
        }
      }
    }

    if (repoName) {
      const matched = matchSlugOrName(repoName);
      if (matched) return matched;
    }
    if (fullName) {
      const matched = matchSlugOrName(fullName);
      if (matched) return matched;
    }
  }

  // 5. Manifest in git root (if different from local)
  if (gitRoot && gitRoot !== resolvedRoot) {
    const rootManifestName = extractProjectNameFromManifest(gitRoot);
    const matchedRootManifest = matchSlugOrName(rootManifestName);
    if (matchedRootManifest) return matchedRootManifest;
  }

  // 6. Folder name
  const folderName = path.basename(resolvedRoot);
  const matchedFolder = matchSlugOrName(folderName);
  if (matchedFolder) return matchedFolder;

  return null;
}

/**
 * Resolves a project slug from a directory path using the standard priority:
 * 1. .kb-sync.json
 * 2. Manifest (package.json, pyproject.toml, etc.)
 * 3. Monorepo subfolder
 * 4. Git remote origin
 * 5. Root manifest
 * 6. Directory name
 */
export function resolveProjectSlugFromDir(dirPath: string): string | undefined {
  if (!dirPath || !fs.existsSync(dirPath)) return undefined;

  const resolved = path.resolve(dirPath);
  const gitRoot = findGitRoot(resolved);

  // 1. .kb-sync.json (local first, then git root)
  const syncCandidates = [
    path.join(resolved, '.kb-sync.json'),
    ...(gitRoot && gitRoot !== resolved ? [path.join(gitRoot, '.kb-sync.json')] : []),
  ];
  for (const syncFile of syncCandidates) {
    if (fs.existsSync(syncFile)) {
      try {
        const sync = JSON.parse(fs.readFileSync(syncFile, 'utf8'));
        if (sync.defaultProject) return sync.defaultProject;
      } catch {}
    }
  }

  // 2. Local manifest (package.json, pyproject.toml, etc.)
  const manifestName = extractProjectNameFromManifest(resolved);
  if (manifestName) {
    const slug = toUrlSlug(manifestName);
    if (slug) return slug;
  }

  // 3. Monorepo subfolder name (if inside a git subfolder)
  if (gitRoot && gitRoot !== resolved) {
    const subfolder = toUrlSlug(path.basename(resolved));
    if (subfolder) return subfolder;
  }

  // 4. Git remote origin
  const remoteUrl = getGitRemoteUrl(resolved);
  if (remoteUrl) {
    const { repoName } = extractGitRepoInfo(remoteUrl);
    if (repoName) return toUrlSlug(repoName);
  }

  // 5. Git root manifest
  if (gitRoot && gitRoot !== resolved) {
    const rootManifestName = extractProjectNameFromManifest(gitRoot);
    if (rootManifestName) {
      const slug = toUrlSlug(rootManifestName);
      if (slug) return slug;
    }
  }

  // 6. Directory name
  return toUrlSlug(path.basename(resolved));
}

/**
 * Tries to detect which KB project corresponds to the currently open workspace.
 */
export async function detectActiveProject(
  client: KbClient,
  folders: readonly vscode.WorkspaceFolder[],
): Promise<string | null> {
  let projects: KbProject[];
  try {
    projects = await client.listProjects();
  } catch {
    return client.defaultProjectSlug || null;
  }

  for (const folder of folders) {
    try {
      const detected = detectProjectFromPath(folder.uri.fsPath, projects);
      if (detected) return detected;
    } catch {
      // ignore
    }
  }

  return client.defaultProjectSlug || (projects[0]?.projectSlug ?? null);
}
