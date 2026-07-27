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
