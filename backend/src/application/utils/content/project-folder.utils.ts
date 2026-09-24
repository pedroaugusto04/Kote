import type { ProjectFolderTreeNode } from '../../models/project-folder.models.js';
import type { ProjectFolderRecord } from '../../models/repository-records.models.js';
import { slugify } from '../../../domain/strings.js';

export function folderSlugFromDisplayName(displayName: string): string {
  return slugify(displayName) || 'folder';
}

export function buildFolderFullSlugPath(parentFullSlugPath: string, folderSlug: string): string {
  return [parentFullSlugPath, folderSlug].filter(Boolean).join('/');
}

export function buildProjectFolderTree(folders: ProjectFolderRecord[]): ProjectFolderTreeNode[] {
  const nodes = new Map<string, ProjectFolderTreeNode>();

  for (const folder of folders) {
    nodes.set(folder.id, {
      id: folder.id,
      projectSlug: folder.projectSlug || '',
      workspaceSlug: folder.workspaceSlug || '',
      parentFolderId: folder.parentFolderId,
      displayName: folder.displayName,
      folderSlug: folder.folderSlug,
      fullSlugPath: folder.fullSlugPath,
      children: [],
    });
  }

  const roots: ProjectFolderTreeNode[] = [];
  for (const node of nodes.values()) {
    if (node.parentFolderId && nodes.has(node.parentFolderId)) {
      nodes.get(node.parentFolderId)?.children.push(node);
      continue;
    }
    roots.push(node);
  }

  const sortChildren = (items: ProjectFolderTreeNode[]) => {
    items.sort((left, right) => left.displayName.localeCompare(right.displayName));
    for (const item of items) sortChildren(item.children);
  };

  sortChildren(roots);
  return roots;
}

export function collectFolderDescendantIds(folders: ProjectFolderRecord[], folderId: string): string[] {
  const byParent = new Map<string | null, ProjectFolderRecord[]>();
  for (const folder of folders) {
    const siblings = byParent.get(folder.parentFolderId) || [];
    siblings.push(folder);
    byParent.set(folder.parentFolderId, siblings);
  }

  const ids: string[] = [];
  const stack = [folderId];
  while (stack.length > 0) {
    const currentId = stack.pop();
    if (!currentId) continue;
    ids.push(currentId);
    for (const child of byParent.get(currentId) || []) stack.push(child.id);
  }
  return ids;
}

export function collectFolderAncestorIds(folders: ProjectFolderRecord[], selectedIds: Set<string> | string[]): Set<string> {
  const byId = new Map(folders.map((folder) => [folder.id, folder]));
  const result = new Set<string>();
  const ids = selectedIds instanceof Set ? selectedIds : new Set(selectedIds);
  for (const selectedId of ids) {
    let current = byId.get(selectedId);
    while (current) {
      result.add(current.id);
      current = current.parentFolderId ? byId.get(current.parentFolderId) : undefined;
    }
  }
  return result;
}

export function buildFolderSummary(
  folders: ProjectFolderRecord[],
  folder: ProjectFolderRecord,
): { folderName: string; folderPath: string } {
  const byId = new Map(folders.map((item) => [item.id, item]));
  const names: string[] = [];
  let current: ProjectFolderRecord | undefined = folder;
  while (current) {
    names.unshift(current.displayName);
    current = current.parentFolderId ? byId.get(current.parentFolderId) : undefined;
  }
  return {
    folderName: folder.displayName,
    folderPath: names.join(' / ') || folder.displayName,
  };
}
