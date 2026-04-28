import { slugify } from './strings.js';
import { nowIso } from './time.js';

export type Workspace = {
  workspaceSlug: string;
  displayName: string;
  whatsappGroupJid: string;
  telegramChatId: string;
  githubRepos: string[];
  projectSlugs: string[];
  createdAt: string;
  updatedAt: string;
};

export async function loadWorkspaces(_manifestPath: string): Promise<Workspace[]> {
  return [];
}

export async function saveWorkspaces(manifestPath: string, workspaces: Workspace[]): Promise<void> {
  void manifestPath;
  void workspaces;
  throw new Error('filesystem_workspace_manifest_removed_use_content_repository');
}

export async function upsertWorkspace(
  manifestPath: string,
  input: Partial<Workspace> & Pick<Workspace, 'workspaceSlug'>,
): Promise<Workspace> {
  const current = await loadWorkspaces(manifestPath);
  const workspaceSlug = slugify(input.workspaceSlug) || 'default';
  const existing = current.find((workspace) => workspace.workspaceSlug === workspaceSlug);
  const merged: Workspace = {
    workspaceSlug,
    displayName: String(input.displayName || existing?.displayName || workspaceSlug).trim(),
    whatsappGroupJid: String(input.whatsappGroupJid || existing?.whatsappGroupJid || '').trim(),
    telegramChatId: String(input.telegramChatId || existing?.telegramChatId || '').trim(),
    githubRepos: Array.from(new Set([...(existing?.githubRepos || []), ...(input.githubRepos || [])].map((value) => String(value || '').trim()).filter(Boolean))),
    projectSlugs: Array.from(new Set([...(existing?.projectSlugs || []), ...(input.projectSlugs || [])].map((value) => slugify(String(value || ''))).filter(Boolean))),
    createdAt: existing?.createdAt || nowIso(),
    updatedAt: nowIso(),
  };
  const remaining = current.filter((workspace) => workspace.workspaceSlug !== workspaceSlug);
  await saveWorkspaces(manifestPath, [...remaining, merged]);
  return merged;
}

export function findWorkspace(workspaces: Workspace[], value: string): Workspace | undefined {
  const target = slugify(value);
  if (!target) return undefined;
  return workspaces.find((workspace) => workspace.workspaceSlug === target || slugify(workspace.displayName) === target);
}
