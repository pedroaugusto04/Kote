import path from 'node:path';
import type { AiSession } from '../ai-history/types';

function normalizePathForComparison(p: string): string {
  const resolved = path.resolve(p.trim());
  return process.platform === 'win32' ? resolved.toLowerCase() : resolved;
}

/**
 * Checks if a candidate directory path matches, contains, or is inside
 * any of the given workspace folder paths (e.g. monorepo root vs subfolder).
 */
export function isPathInWorkspaceFolders(
  candidatePath?: string | null,
  workspaceFolderPaths: readonly string[] = []
): boolean {
  if (!candidatePath || !candidatePath.trim()) return false;
  if (!workspaceFolderPaths || workspaceFolderPaths.length === 0) return true;

  const normCandidate = normalizePathForComparison(candidatePath);

  for (const root of workspaceFolderPaths) {
    if (!root || !root.trim()) continue;
    const normRoot = normalizePathForComparison(root);

    // Exact match
    if (normCandidate === normRoot) return true;

    // candidate is inside root (e.g. root/packages/app)
    if (normCandidate.startsWith(normRoot + path.sep)) return true;

    // root is inside candidate (e.g. root is a subfolder and session ran at repo root)
    if (normRoot.startsWith(normCandidate + path.sep)) return true;
  }

  return false;
}

/**
 * Determines whether an AI session belongs to the workspace folders open in this window.
 *
 * If the current window has no open folders, returns true.
 * If the session has a known workspaceDir, it checks if it intersects with any open workspace folder.
 * If the session only has a projectSlug, it checks if it matches the window's activeProjectSlug.
 */
export function isSessionInWorkspaceFolders(
  session: AiSession,
  workspaceFolderPaths: readonly string[] = [],
  activeProjectSlug?: string | null
): boolean {
  // If no folders are open in this window, don't restrict
  if (!workspaceFolderPaths || workspaceFolderPaths.length === 0) {
    return true;
  }

  // Primary check: filesystem directory boundary
  if (session.workspaceDir) {
    return isPathInWorkspaceFolders(session.workspaceDir, workspaceFolderPaths);
  }

  // Secondary check: gitActivity cwd if present
  if (session.gitActivity?.cwd) {
    return isPathInWorkspaceFolders(session.gitActivity.cwd, workspaceFolderPaths);
  }

  // Fallback check: if projectSlug is present and activeProjectSlug is known
  if (session.projectSlug && activeProjectSlug) {
    return session.projectSlug === activeProjectSlug;
  }

  // If no directory or project information could be determined, allow as fallback
  return true;
}
