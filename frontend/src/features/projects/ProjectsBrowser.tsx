import type { Dashboard } from '../../shared/api/models/dashboard';
import type { NoteSummary } from '../../shared/api/models/note';
import type { ProjectFolder } from '../../shared/api/models/project-folder';
import type { Project } from '../../shared/api/models/project';
import { Pagination } from '../../shared/ui/pagination';
import { EmptyState, Panel, Tags } from '../../shared/ui/primitives';
import { NoteRow } from '../../widgets/notes/NoteRow';
import { FolderTree } from './FolderTree';
import { ProjectFolderActionsMenu } from './ProjectFolderActionsMenu';

type ProjectsBrowserProps = {
  dashboard: Dashboard;
  project: Project;
  folderTree: ProjectFolder[];
  selectedFolderId: string;
  selectedFolder: ProjectFolder | null;
  notes: NoteSummary[];
  notesPagination?: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
    hasNext: boolean;
    hasPrevious: boolean;
  };
  onFolderSelect: (folderId: string) => void;
  onCreateNote: () => void;
  onCreateFolder: () => void;
  onEditFolder: () => void;
  onDeleteFolder: () => void;
  onEditNote: (note: NoteSummary) => void;
  onDeleteNote: (note: NoteSummary) => void;
  onOpenNote: (noteId: string) => void;
  onNotesPageChange: (page: number) => void;
};

export function ProjectsBrowser({
  dashboard,
  project,
  folderTree,
  selectedFolderId,
  selectedFolder,
  notes,
  notesPagination,
  onFolderSelect,
  onCreateNote,
  onCreateFolder,
  onEditFolder,
  onDeleteFolder,
  onEditNote,
  onDeleteNote,
  onOpenNote,
  onNotesPageChange,
}: ProjectsBrowserProps) {
  return (
    <Panel className="spaced">
      <div className="page-head">
        <div>
          <h2>{project.displayName}</h2>
          <div className="card-repos">
            {project.repositories.map((repo) => (
              <span key={repo.externalId} className="repo-tag">
                {repo.fullName}
              </span>
            ))}
          </div>
        </div>
        <div className="project-actions">
          <Tags items={project.defaultTags} />
          <button className="icon-button" type="button" onClick={onCreateNote}>Nova nota</button>
        </div>
      </div>
      <div className="project-browser">
        <aside className="folder-browser">
          <div className="folder-browser-head">
            <div className="folder-browser-head-top">
              <strong>Pastas</strong>
              <div className="folder-browser-actions">
                <button aria-label="Nova pasta" className="row-action-button" title="Nova pasta" type="button" onClick={onCreateFolder}>
                  <svg aria-hidden="true" viewBox="0 0 16 16">
                    <path d="M8 3v10" fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth="1.2" />
                    <path d="M3 8h10" fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth="1.2" />
                  </svg>
                </button>
                {selectedFolder ? (
                  <ProjectFolderActionsMenu
                    folderName={selectedFolder.displayName}
                    onDelete={onDeleteFolder}
                    onRename={onEditFolder}
                  />
                ) : null}
              </div>
            </div>
            <span className="meta">{selectedFolder ? selectedFolder.displayName : 'Raiz'}</span>
          </div>
          <FolderTree
            folders={folderTree}
            selectedFolderId={selectedFolderId}
            onSelect={onFolderSelect}
          />
        </aside>
        <div className="folder-notes">
          <div className="folder-notes-head">
            <h3>{selectedFolder ? selectedFolder.displayName : 'Raiz'}</h3>
            <p className="meta">{selectedFolder ? selectedFolder.fullSlugPath : 'Notas sem pasta dentro do projeto.'}</p>
          </div>
          {notes.length > 0 ? (
            <div className="timeline">
              {notes.map((note) => (
                <div className="timeline-item" key={note.id}>
                  <NoteRow
                    dashboard={dashboard}
                    note={note}
                    onDelete={onDeleteNote}
                    onEdit={onEditNote}
                    onOpen={onOpenNote}
                  />
                </div>
              ))}
            </div>
          ) : (
            <EmptyState>Sem notas nesta pasta.</EmptyState>
          )}
          {notesPagination ? <Pagination pagination={notesPagination} onPageChange={onNotesPageChange} /> : null}
        </div>
      </div>
    </Panel>
  );
}
