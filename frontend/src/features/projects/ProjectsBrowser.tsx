import type { Dashboard } from '../../shared/api/models/dashboard';
import type { NoteSummary } from '../../shared/api/models/note';
import type { ProjectBriefPanelResponse } from '../../shared/api/models/project-brief';
import type { ProjectTimelineCategory, ProjectTimelineItem } from '../../shared/api/models/project-timeline';
import type { ProjectFolder } from '../../shared/api/models/project-folder';
import type { Project } from '../../shared/api/models/project';
import { formatDisplayToken } from '../../shared/utils/format';
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
  briefResponse?: ProjectBriefPanelResponse;
  briefLoading?: boolean;
  briefHistoryLoading?: boolean;
  briefError?: string;
  briefHistoryError?: string;
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
  onGenerateBrief: () => void;
  onShowLatestBrief: () => void;
  onCreateNote: () => void;
  onCreateFolder: () => void;
  onEditFolder: () => void;
  onDeleteFolder: () => void;
  onEditNote: (note: NoteSummary) => void;
  onDeleteNote: (note: NoteSummary) => void;
  onOpenNote: (noteId: string) => void;
  onOpenNoteFullPage?: (noteId: string) => void;
  onEditProject?: () => void;
  onDeleteProject?: () => void;
  deleteProjectLabel?: string;
  isStale?: boolean;
  timelineResetKey: string;
};

export function ProjectsBrowser({
  dashboard,
  project,
  folderTree,
  selectedFolderId,
  selectedFolder,
  timelineItems,
  briefResponse,
  briefLoading = false,
  briefHistoryLoading = false,
  briefError = '',
  briefHistoryError = '',
  timelineCategory,
  timelinePagination,
  onTimelineCategoryChange,
  onTimelinePageChange,
  onFolderSelect,
  onGenerateBrief,
  onShowLatestBrief,
  onCreateNote,
  onCreateFolder,
  onEditFolder,
  onDeleteFolder,
  onEditNote,
  onDeleteNote,
  onOpenNote,
  onOpenNoteFullPage,
  onEditProject,
  onDeleteProject,
  deleteProjectLabel,
  isStale = false,
  timelineResetKey,
}: ProjectsBrowserProps) {
  const folderScopeLabel = selectedFolder ? `${selectedFolder.displayName} and descendant folders` : 'All project notes';

  return (
    <Panel>
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
      <ProjectBriefPanel
        response={briefResponse}
        loading={briefLoading}
        historyLoading={briefHistoryLoading}
        error={briefError}
        historyError={briefHistoryError}
        onGenerate={onGenerateBrief}
        onShowLatest={onShowLatestBrief}
        onOpenNote={onOpenNote}
      />
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
            <span className="meta">{folderScopeLabel}</span>
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
          onOpenNoteFullPage={onOpenNoteFullPage}
          onPageChange={onTimelinePageChange}
          isStale={isStale}
          resetKey={timelineResetKey}
        />
      </div>
    </Panel>
  );
}

function ProjectBriefPanel({
  response,
  loading,
  historyLoading,
  error,
  historyError,
  onGenerate,
  onShowLatest,
  onOpenNote,
}: {
  response?: ProjectBriefPanelResponse;
  loading: boolean;
  historyLoading: boolean;
  error: string;
  historyError: string;
  onGenerate: () => void;
  onShowLatest: () => void;
  onOpenNote: (noteId: string) => void;
}) {
  const brief = response?.brief;
  const source = response && 'source' in response ? response.source : '';
  const hasNoSavedBrief = source === 'none';
  const isFallback = Boolean(response && 'fallback' in response && response.fallback);
  const busy = loading || historyLoading;
  return (
    <section className="project-brief-panel" aria-label="Project brief">
      <div className="project-brief-head">
        <div>
          <h3>Project brief</h3>
          <p>{brief ? `Generated ${new Date(brief.generatedAt).toLocaleString('en-US')}` : hasNoSavedBrief ? 'No saved brief yet.' : 'Generate a new brief or show the latest saved one.'}</p>
        </div>
        <div className="project-brief-actions">
          <button className="icon-button" disabled={busy} type="button" onClick={onGenerate}>
            {loading ? 'Generating...' : 'Generate brief'}
          </button>
          <button className="icon-button secondary" disabled={busy} type="button" onClick={onShowLatest}>
            {historyLoading ? 'Loading...' : source === 'history' ? 'Hide latest' : 'Show latest'}
          </button>
        </div>
      </div>
      {isFallback ? (
        <div className="project-brief-fallback" role="status">Showing the latest saved brief because generation failed.</div>
      ) : null}
      {source === 'history' ? (
        <div className="project-brief-fallback" role="status">Showing the latest saved brief.</div>
      ) : null}
      {error || historyError ? <div className="project-brief-error" role="alert">{error || historyError}</div> : null}
      {brief ? (
        <div className="project-brief-grid">
          <ProjectBriefSection title="Summary" items={[brief.summary]} />
          <ProjectBriefSection title="Status" items={[brief.status]} />
          <ProjectBriefSection title="Recent changes" items={brief.recentChanges} />
          <ProjectBriefSection title="Decisions" items={brief.decisions} />
          <ProjectBriefSection title="Open items" items={brief.openItems} />
          <ProjectBriefSection title="Risks" items={brief.risks} />
          <ProjectBriefSection title="Next steps" items={brief.nextSteps} />
          <div className="project-brief-section">
            <strong>Sources</strong>
            {brief.sources.length > 0 ? (
              <ul>
                {brief.sources.map((source) => (
                  <li key={source.noteId}>
                    <button className="project-brief-source" type="button" onClick={() => onOpenNote(source.noteId)}>
                      {source.title || source.path || source.noteId}
                    </button>
                    <span className="meta">{source.date}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p>No sources.</p>
            )}
          </div>
        </div>
      ) : null}
    </section>
  );
}

function ProjectBriefSection({ title, items }: { title: string; items: string[] }) {
  const filtered = items.map((item) => item.trim()).filter(Boolean);
  return (
    <div className="project-brief-section">
      <strong>{title}</strong>
      {filtered.length > 0 ? (
        <ul>
          {filtered.map((item, index) => <li key={`${title}-${index}`}>{item}</li>)}
        </ul>
      ) : (
        <p>None.</p>
      )}
    </div>
  );
}
