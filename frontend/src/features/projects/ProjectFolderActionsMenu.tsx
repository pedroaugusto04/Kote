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
  return (
    <>
      <button
        aria-label={`Editar pasta ${folderName}`}
        className="row-action-button"
        title={`Editar pasta ${folderName}`}
        type="button"
        onClick={onRename}
      >
        <svg aria-hidden="true" viewBox="0 0 16 16">
          <path d="M11.9 1.6a1.5 1.5 0 0 1 2.1 2.1l-7.7 7.7-3.3.9.9-3.3z" fill="none" stroke="currentColor" strokeLinejoin="round" strokeWidth="1.2" />
          <path d="M9.8 3.7l2.5 2.5" fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth="1.2" />
        </svg>
      </button>
      <button
        aria-label={`Excluir pasta ${folderName}`}
        className="row-action-button danger"
        title={`Excluir pasta ${folderName}`}
        type="button"
        onClick={onDelete}
      >
        <svg aria-hidden="true" viewBox="0 0 16 16">
          <path d="M2.8 4.2h10.4" fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth="1.2" />
          <path d="M6.2 2.7h3.6" fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth="1.2" />
          <path d="M4.1 4.2l.6 8.1h6.6l.6-8.1" fill="none" stroke="currentColor" strokeLinejoin="round" strokeWidth="1.2" />
        </svg>
      </button>
    </>
  );
}
