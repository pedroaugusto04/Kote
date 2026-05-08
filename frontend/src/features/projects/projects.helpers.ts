import type { ProjectFolder } from '../../shared/api/models/project-folder';
import type { FlatProjectFolder } from './projects.types';

export function parseList(value: string): string[] {
  return [...new Set(value.split(',').map((item) => item.trim()).filter(Boolean))];
}

export function flattenFolders(folders: ProjectFolder[], depth = 0): FlatProjectFolder[] {
  return folders.flatMap((folder) => [
    { ...folder, depth },
    ...flattenFolders(folder.children, depth + 1),
  ]);
}

export function collectFolderAndDescendantIds(folder: ProjectFolder): string[] {
  return [folder.id, ...folder.children.flatMap(collectFolderAndDescendantIds)];
}
