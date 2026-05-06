import { useEffect, useRef, useState } from 'react';

type ProjectFolderActionsMenuProps = {
  folderName: string;
  onDelete: () => void;
  onRename: () => void;
};

export function ProjectFolderActionsMenu({
  folderName,
  onDelete,
  onRename,
}: ProjectFolderActionsMenuProps) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) {
      return undefined;
    }

    function handlePointerDown(event: MouseEvent) {
      if (!containerRef.current?.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }

    function handleEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setIsOpen(false);
      }
    }

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleEscape);

    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [isOpen]);

  function runAction(action: () => void) {
    setIsOpen(false);
    action();
  }

  return (
    <div className="folder-actions-menu" ref={containerRef}>
      <button
        aria-expanded={isOpen}
        aria-haspopup="menu"
        className="filter-chip folder-actions-trigger"
        type="button"
        onClick={() => setIsOpen((current) => !current)}
      >
        Acoes da pasta
      </button>
      {isOpen ? (
        <div className="folder-actions-popover" role="menu">
          <button className="filter-chip folder-actions-item" role="menuitem" type="button" onClick={() => runAction(onRename)}>
            Renomear {folderName}
          </button>
          <button
            className="filter-chip folder-actions-item folder-actions-item-danger"
            role="menuitem"
            type="button"
            onClick={() => runAction(onDelete)}
          >
            Excluir {folderName}
          </button>
        </div>
      ) : null}
    </div>
  );
}
