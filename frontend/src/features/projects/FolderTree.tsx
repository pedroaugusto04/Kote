import { useState } from 'react';
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
  collapsedFolders: Record<string, boolean>;
  onToggle: (folderId: string) => void;
};

export function FolderTree({ folders, selectedFolderId, onSelect }: FolderTreeProps) {
  const [collapsedFolders, setCollapsedFolders] = useState<Record<string, boolean>>({});

  const handleToggle = (folderId: string) => {
    setCollapsedFolders((prev) => ({
      ...prev,
      [folderId]: !prev[folderId],
    }));
  };

  return (
    <div className="folder-tree">
      <div
        className={`folder-tree-row ${selectedFolderId === ROOT_FOLDER_ID ? 'active' : ''}`}
        style={{ paddingLeft: '12px' }}
      >
        <span className="folder-toggle-spacer" />
        <button
          className="folder-select-btn"
          type="button"
          onClick={() => onSelect(ROOT_FOLDER_ID)}
        >
          Root
        </button>
      </div>
      {folders.map((folder) => (
        <FolderTreeNode
          key={folder.id}
          folder={folder}
          selectedFolderId={selectedFolderId}
          onSelect={onSelect}
          depth={0}
          collapsedFolders={collapsedFolders}
          onToggle={handleToggle}
        />
      ))}
    </div>
  );
}

function FolderTreeNode({
  folder,
  selectedFolderId,
  onSelect,
  depth,
  collapsedFolders,
  onToggle,
}: FolderTreeNodeProps) {
  const isCollapsed = collapsedFolders[folder.id] || false;
  const hasChildren = folder.children && folder.children.length > 0;

  return (
    <>
      <div
        className={`folder-tree-row ${selectedFolderId === folder.id ? 'active' : ''}`}
        style={{ paddingLeft: `${12 + depth * 18}px` }}
      >
        {hasChildren ? (
          <button
            className="folder-toggle-btn"
            type="button"
            onClick={() => onToggle(folder.id)}
            aria-label={isCollapsed ? 'Expand folder' : 'Collapse folder'}
          >
            <svg
              viewBox="0 0 16 16"
              width="12"
              height="12"
              className={`chevron-icon ${isCollapsed ? 'collapsed' : 'expanded'}`}
              aria-hidden="true"
            >
              <path
                d="M6 3.5L10.5 8L6 12.5"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
        ) : (
          <span className="folder-toggle-spacer" />
        )}
        <button
          className="folder-select-btn"
          type="button"
          onClick={() => onSelect(folder.id)}
          title={folder.displayName}
        >
          {folder.displayName}
        </button>
      </div>
      {!isCollapsed &&
        folder.children.map((child) => (
          <FolderTreeNode
            key={child.id}
            folder={child}
            selectedFolderId={selectedFolderId}
            onSelect={onSelect}
            depth={depth + 1}
            collapsedFolders={collapsedFolders}
            onToggle={onToggle}
          />
        ))}
    </>
  );
}

