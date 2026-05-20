import type { Dashboard } from '../../shared/api/models/dashboard';
import type { NoteSummary } from '../../shared/api/models/note';
import type { ProjectTimelineCategory, ProjectTimelineItem } from '../../shared/api/models/project-timeline';
import type { ProjectFolder } from '../../shared/api/models/project-folder';
import type { Project } from '../../shared/api/models/project';
import { formatDisplayToken } from '../../entities/format';
import { Panel, Tags } from '../../shared/ui/primitives';
import { FolderTree } from './FolderTree';
import { ProjectFolderActionsMenu } from './ProjectFolderActionsMenu';
import { ProjectTimeline } from './ProjectTimeline';

type ProjectsBrowserProps = {
  dashboard: Dashboard;
  project: Project;
  folderTree: ProjectFolder[];
  selectedFolderId: string;
  selectedFolder: ProjectFolder | null;
  timelineItems: ProjectTimelineItem[];
  timelineCategory: ProjectTimelineCategory;
  timelinePagination?: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
    hasNext: boolean;
    hasPrevious: boolean;
  };
  onTimelineCategoryChange: (category: ProjectTimelineCategory) => void;
  onTimelinePageChange: (page: number) => void;
  onFolderSelect: (folderId: string) => void;
  onCreateNote: () => void;
  onCreateFolder: () => void;
  onEditFolder: () => void;
  onDeleteFolder: () => void;
  onEditNote: (note: NoteSummary) => void;
  onDeleteNote: (note: NoteSummary) => void;
  onOpenNote: (noteId: string) => void;
  onEditProject?: () => void;
  onDeleteProject?: () => void;
  deleteProjectLabel?: string;
};

export function ProjectsBrowser({
  dashboard,
  project,
  folderTree,
  selectedFolderId,
  selectedFolder,
  timelineItems,
  timelineCategory,
  timelinePagination,
  onTimelineCategoryChange,
  onTimelinePageChange,
  onFolderSelect,
  onCreateNote,
  onCreateFolder,
  onEditFolder,
  onDeleteFolder,
  onEditNote,
  onDeleteNote,
  onOpenNote,
  onEditProject,
  onDeleteProject,
  deleteProjectLabel,
}: ProjectsBrowserProps) {
  return (
    <Panel className="spaced">
      <div className="page-head">
        <div>
          <div className="project-title-row">
            <h2>{project.displayName}</h2>
            <div className="project-title-actions" aria-label="Project actions">
              {onEditProject ? (
                <button
                  aria-label={`Edit project ${project.displayName}`}
                  className="row-action-button"
                  title={`Edit project ${project.displayName}`}
                  type="button"
                  onClick={onEditProject}
                >
                  <svg aria-hidden="true" viewBox="0 0 16 16">
                    <path d="M10.8 2.6l2.6 2.6-7.2 7.2-3.1.5.5-3.1 7.2-7.2z" fill="none" stroke="currentColor" strokeLinejoin="round" strokeWidth="1.2" />
                    <path d="M9.8 3.6l2.6 2.6" fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth="1.2" />
                  </svg>
                </button>
              ) : null}
              <button
                aria-label={onDeleteProject ? `Delete project ${project.displayName}` : deleteProjectLabel}
                className="row-action-button danger"
                disabled={!onDeleteProject}
                title={deleteProjectLabel}
                type="button"
                onClick={onDeleteProject}
              >
                <svg aria-hidden="true" viewBox="0 0 16 16">
                  <path d="M3.5 4.5h9" fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth="1.2" />
                  <path d="M6.5 4.5V3.2h3v1.3" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.2" />
                  <path d="M5 6.4l.5 6.4h5l.5-6.4" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.2" />
                </svg>
              </button>
            </div>
          </div>
          <div className="card-repos">
            {project.repositories.map((repo) => (
              <span key={repo.externalId} className="repo-tag">
                {repo.fullName}
              </span>
            ))}
          </div>
        </div>
        <div className="project-actions">
          <Tags items={project.defaultTags.map(formatDisplayToken)} />
          <button className="icon-button" type="button" onClick={onCreateNote}>New note</button>
        </div>
      </div>
      <div className="project-browser">
        <aside className="folder-browser">
          <div className="folder-browser-head">
            <div className="folder-browser-head-top">
              <strong>Folders</strong>
              <div className="folder-browser-actions">
                <button aria-label="New folder" className="row-action-button" title="New folder" type="button" onClick={onCreateFolder}>
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
            <span className="meta">{selectedFolder ? selectedFolder.displayName : 'Root'}</span>
          </div>
          <FolderTree
            folders={folderTree}
            selectedFolderId={selectedFolderId}
            onSelect={onFolderSelect}
          />
        </aside>
        <ProjectTimeline
          dashboard={dashboard}
          items={timelineItems}
          pagination={timelinePagination}
          category={timelineCategory}
          onCategoryChange={onTimelineCategoryChange}
          onDeleteNote={onDeleteNote}
          onEditNote={onEditNote}
          onOpenNote={onOpenNote}
          onPageChange={onTimelinePageChange}
        />
      </div>
    </Panel>
  );
}
