import type { ProjectFolder } from '../../shared/api/models/project-folder';
import { ROOT_FOLDER_ID } from './projects.constants';

type FolderTreeProps = {
  folders: ProjectFolder[];
  selectedFolderId: string;
  onSelect: (folderId: string) => void;
};

type FolderTreeNodeProps = {
  folder: ProjectFolder;
  selectedFolderId: string;
  onSelect: (folderId: string) => void;
  depth: number;
};

export function FolderTree({ folders, selectedFolderId, onSelect }: FolderTreeProps) {
  return (
    <div className="folder-tree">
      <button
        className={`folder-tree-item ${selectedFolderId === ROOT_FOLDER_ID ? 'active' : ''}`}
        type="button"
        onClick={() => onSelect(ROOT_FOLDER_ID)}
      >
        Root
      </button>
      {folders.map((folder) => (
        <FolderTreeNode key={folder.id} folder={folder} selectedFolderId={selectedFolderId} onSelect={onSelect} depth={0} />
      ))}
    </div>
  );
}

function FolderTreeNode({ folder, selectedFolderId, onSelect, depth }: FolderTreeNodeProps) {
  return (
    <>
      <button
        className={`folder-tree-item ${selectedFolderId === folder.id ? 'active' : ''}`}
        style={{ paddingLeft: `${12 + depth * 18}px` }}
        type="button"
        onClick={() => onSelect(folder.id)}
      >
        {folder.displayName}
      </button>
      {folder.children.map((child) => (
        <FolderTreeNode key={child.id} folder={child} selectedFolderId={selectedFolderId} onSelect={onSelect} depth={depth + 1} />
      ))}
    </>
  );
}
