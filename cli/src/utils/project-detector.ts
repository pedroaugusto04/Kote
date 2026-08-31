import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { toUrlSlug } from './text.js';

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

  // 2. Direct read of .git/config
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
