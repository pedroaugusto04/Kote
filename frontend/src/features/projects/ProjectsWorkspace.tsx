import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';

import type { ProjectsPageContext } from '../../app/page-context';
import {
  deleteNote,
  deleteProject,
  deleteProjectFolder,
  fetchAllProjectsTimeline,
  fetchProjectFolders,
  fetchProjectTimeline,
  pinNote,
  runQuery,
} from '../../shared/api/client';
import { SOURCE_VALUES } from '../../shared/utils/format';
import { fetchGithubRepositories, fetchIntegrations } from '../../shared/api/integrations';
import type { ProjectTimelineCategory, ProjectTimelineItem, ProjectTimelineItemCategory } from '../../shared/api/models/project-timeline';
import { StatusFilter, type NoteStatus, type NoteStatusFilter } from '../../shared/api/models/note-status';
import { DEFAULT_PAGE_SIZE } from '../../shared/api/models/pagination';
import { formatDisplayToken } from '../../shared/utils/format';
import { ensureNoteDetail, invalidateNoteRelatedQueries } from '../../shared/api/note-query';
import { notifyGeneralFormError } from '../../shared/forms/errors';
import { notifySuccess } from '../../shared/ui/notifications';
import { ConfirmationModal } from '../../shared/ui/confirmation-modal';
import { EmptyState, InlineMessage, PageHead, Panel } from '../../shared/ui/primitives';
import { Select } from '../../shared/ui/select';
import { Pagination } from '../../shared/ui/pagination';
import { MobileInfinitePagination, useMobilePaginatedItems } from '../../shared/ui/mobile-infinite-pagination';
import { usePaginationState } from '../../shared/ui/use-pagination-state';
import { useDebouncedValue } from '../../shared/ui/use-debounced-value';
import { useGlobalLoading } from '../../app/global-loading';
import { useMediaQuery } from '../../shared/ui/use-media-query';
import { ROOT_FOLDER_ID } from './projects.constants';
import { PROJECTS_WORKSPACE_MESSAGES } from './projects-ui.constants';
import { UI_MESSAGES } from '../../shared/constants/ui.constants';
import { QUERY_KEYS } from '../../shared/constants/query-keys.constants';
import { ProjectFolderModal } from './modals/ProjectFolderModal';
import { ProjectNoteModal } from './modals/ProjectNoteModal';
import { ProjectModal } from './modals/ProjectModal';
import { ProjectsBrowser } from './ProjectsBrowser';
import { flattenFolders } from './projects.helpers';
import type { ConfirmState, FolderModalState, NoteModalState, ProjectModalState } from './projects.types';
import { ProjectTimeline } from './ProjectTimeline';
import { ProjectTimelineCard } from './ProjectTimelineCard';
import { SideNoteDrawer } from '../../widgets/notes/SideNoteDrawer';
import { SearchIcon } from '../../shared/ui/icons';

const statusOptions: Array<{ value: NoteStatusFilter; label: string }> = [
  { value: StatusFilter.Open, label: PROJECTS_WORKSPACE_MESSAGES.STATUS_OPTIONS.OPEN },
  { value: '', label: PROJECTS_WORKSPACE_MESSAGES.STATUS_OPTIONS.ALL },
  ...(['active', 'pending', 'overdue', 'sent', 'resolved', 'archived'] as NoteStatus[]).map((value) => ({
    value,
    label: formatDisplayToken(value),
  })),
];


type ProjectsWorkspaceProps = ProjectsPageContext;

export function ProjectsWorkspace({
  dashboard,
  selectedProject,
  openProject,
  openNote,
  createNote,
}: ProjectsWorkspaceProps) {
  const isMobile = useMediaQuery('(max-width: 768px)');
  const params = useParams();
  const queryClient = useQueryClient();
  const globalLoading = useGlobalLoading();
  const [projectModal, setProjectModal] = useState<ProjectModalState | null>(null);
  const [folderModal, setFolderModal] = useState<FolderModalState | null>(null);
  const [noteModal, setNoteModal] = useState<NoteModalState | null>(null);
  const [confirmState, setConfirmState] = useState<ConfirmState | null>(null);
  const [selectedFolderId, setSelectedFolderId] = useState(ROOT_FOLDER_ID);
  const [timelineCategory, setTimelineCategory] = useState<ProjectTimelineCategory>('all');
  const [timelineStatus, setTimelineStatus] = useState<NoteStatusFilter>(StatusFilter.Open);
  const [hiddenLatestBriefProjects, setHiddenLatestBriefProjects] = useState<Record<string, boolean>>({});
  const [sideNoteId, setSideNoteId] = useState<string | null>(null);

  // Search state
  const [searchInput, setSearchInput] = useState('');
  const debouncedSearchInput = useDebouncedValue(searchInput, PROJECTS_WORKSPACE_MESSAGES.SEARCH.DEBOUNCE_MS);
  const hasSearchQuery = Boolean(debouncedSearchInput.trim());

  const handleOpenNote = (id: string) => {
    if (isMobile || sideNoteId === id) {
      openNote(id);
    } else {
      setSideNoteId(id);
    }
  };
  const routeProject = params.projectSlug ? decodeURIComponent(params.projectSlug) : '';
  const selectedSlug = routeProject || selectedProject;
  const dashboardNotes = dashboard.notes || [];
  const selected = selectedSlug
    ? dashboard.projects.find((project) => project.projectSlug === selectedSlug) || dashboard.projects[0]
    : undefined;
  const isAllProjectsSelected = !selectedSlug;
  const workspaceSlug = dashboard.workspaces[0]?.workspaceSlug || '';

  useEffect(() => {
    setSelectedFolderId(ROOT_FOLDER_ID);
  }, [selected?.projectSlug]);

  // Clear search when switching projects
  useEffect(() => {
    setSearchInput('');
  }, [selectedSlug]);

  const foldersQuery = useQuery({
    queryKey: QUERY_KEYS.PROJECTS.FOLDERS(selected?.projectSlug || ''),
    queryFn: () => fetchProjectFolders(selected?.projectSlug || ''),
    enabled: Boolean(selected?.projectSlug),
    initialData: selected ? { ok: true as const, projectSlug: selected.projectSlug, folders: [] } : undefined,
  });
  const folderTree = foldersQuery.data?.folders || [];
  const flatFolders = useMemo(() => flattenFolders(folderTree), [folderTree]);
  const selectedFolder = flatFolders.find((folder) => folder.id === selectedFolderId) || null;
  const timelinePagination = usePaginationState(`${selected?.projectSlug || 'all'}:${selectedFolderId}:${timelineCategory}:${timelineStatus}:timeline`);
  const allProjectsTimelineQuery = useQuery({
    queryKey: QUERY_KEYS.PROJECTS.TIMELINE_ALL_PROJECTS(timelineCategory, timelineStatus, timelinePagination.page),
    queryFn: () => fetchAllProjectsTimeline({
      page: timelinePagination.page,
      category: timelineCategory,
      status: timelineStatus,
    }),
    enabled: isAllProjectsSelected && !hasSearchQuery,
    staleTime: 0,
    placeholderData: keepPreviousData,
  });
  const timelineQuery = useQuery({
    queryKey: QUERY_KEYS.PROJECTS.TIMELINE(selected?.projectSlug || '', selectedFolderId, timelineCategory, timelineStatus, timelinePagination.page),
    queryFn: () => fetchProjectTimeline(selected?.projectSlug || '', {
      page: timelinePagination.page,
      category: timelineCategory,
      folderId: selectedFolderId || undefined,
      status: timelineStatus,
    }),
    enabled: Boolean(selected?.projectSlug) && !hasSearchQuery,
    staleTime: 0,
    placeholderData: keepPreviousData,
  });

  // Search query — scoped to the selected project
  const searchPaginationKey = `search:${debouncedSearchInput}:${selectedSlug}:${timelineStatus}`;
  const { page: searchPage, setPage: setSearchPage } = usePaginationState(searchPaginationKey);
  const searchQuery = useQuery({
    queryKey: QUERY_KEYS.PROJECTS.SEARCH(debouncedSearchInput, selectedSlug, workspaceSlug, timelineStatus, searchPage),
    queryFn: () => runQuery({
      query: debouncedSearchInput,
      projectSlug: selectedSlug || '',
      workspaceSlug,
      status: timelineStatus,
      limit: 10,
      page: searchPage,
      pageSize: DEFAULT_PAGE_SIZE,
    }),
    enabled: hasSearchQuery,
    placeholderData: keepPreviousData,
  });

  const searchResults: ProjectTimelineItem[] = useMemo(() => {
    if (!searchQuery.data?.matches) return [];
    return searchQuery.data.matches.map((match) => ({
      id: match.id,
      noteId: match.id,
      title: match.title,
      summary: match.summary,
      project: match.project,
      workspace: match.workspace,
      folderId: match.folderId,
      categories: match.categories,
      type: match.type,
      category: deriveTimelineCategory(match.source) as ProjectTimelineItemCategory,
      status: match.status,
      source: match.source,
      sourceChannel: match.source,
      date: match.date,
      tags: match.tags,
      path: match.path,
      attachmentCount: match.attachmentCount || 0,
      isPinned: match.isPinned,
    }));
  }, [searchQuery.data?.matches]);

  const searchPagination = searchQuery.data?.pagination;
  const {
    isMobilePagination: isSearchMobilePagination,
    loadedMobilePage: searchLoadedMobilePage,
    visibleItems: paginatedSearchResults,
  } = useMobilePaginatedItems({
    items: searchResults,
    pagination: searchPagination,
    resetKey: searchPaginationKey,
    isPlaceholderData: searchQuery.isPlaceholderData,
  });

  const timelineItems = timelineQuery.data?.timeline || [];
  const selectedProjectDeleteBlockedReason = selected?.projectSlug === 'inbox'
    ? UI_MESSAGES.INBOX_CANNOT_BE_CHANGED
    : dashboardNotes.some((note) => note.project === selected?.projectSlug)
      ? UI_MESSAGES.DELETE_OR_MOVE_PROJECT_NOTES
      : '';
  const { data: integrationsResponse } = useQuery({
    queryKey: QUERY_KEYS.INTEGRATIONS.ALL(workspaceSlug),
    queryFn: () => fetchIntegrations(workspaceSlug || ''),
    enabled: Boolean(workspaceSlug),
  });
  const githubConnected = integrationsResponse?.integrations.some(
    (integration) => integration.provider === 'github-app' && integration.status === 'connected',
  ) || false;
  const { data: repositoriesResponse } = useQuery({
    queryKey: QUERY_KEYS.INTEGRATIONS.GITHUB_REPOSITORIES(workspaceSlug),
    queryFn: () => fetchGithubRepositories(workspaceSlug || ''),
    enabled: Boolean(workspaceSlug) && githubConnected,
  });
  const workspaceRepositories = repositoriesResponse?.repositories || [];
  const loadNoteMutation = useMutation({
    mutationFn: (id: string) => globalLoading.trackPromise(ensureNoteDetail(queryClient, id)),
    onSuccess: (note) => setNoteModal({ mode: 'edit', note }),
    onError: (error) => notifyGeneralFormError(error, UI_MESSAGES.COULD_NOT_LOAD_NOTE_FOR_EDITING),
  });
  const searchPinMutation = useMutation({
    mutationFn: ({ noteId, pinned }: { noteId: string; pinned: boolean }) => pinNote(noteId, pinned),
    onSuccess: async (_, { pinned }) => {
      notifySuccess(pinned ? UI_MESSAGES.NOTE_PINNED : UI_MESSAGES.NOTE_UNPINNED);
      await invalidateNoteRelatedQueries(queryClient);
    },
    onError: (error) => notifyGeneralFormError(error, UI_MESSAGES.COULD_NOT_TOGGLE_PIN_STATUS),
  });
  const deleteProjectMutation = useMutation({
    mutationFn: (projectSlug: string) => globalLoading.trackPromise(deleteProject(projectSlug)),
    onSuccess: async (_, projectSlug) => {
      const nextProjectSlug = dashboard.projects.filter((project) => project.projectSlug !== projectSlug)[0]?.projectSlug || 'inbox';
      setConfirmState(null);
      notifySuccess(UI_MESSAGES.PROJECT_DELETED);
      openProject(nextProjectSlug);
      await refreshDashboard(queryClient);
    },
    onError: (error) => notifyGeneralFormError(error, UI_MESSAGES.COULD_NOT_DELETE_PROJECT),
  });
  const deleteFolderMutation = useMutation({
    mutationFn: ({ projectSlug, folderId }: { projectSlug: string; folderId: string }) => globalLoading.trackPromise(deleteProjectFolder(projectSlug, folderId)),
    onSuccess: async () => {
      setConfirmState(null);
      setSelectedFolderId(ROOT_FOLDER_ID);
      notifySuccess(UI_MESSAGES.FOLDER_DELETED);
      await refreshDashboard(queryClient);
    },
    onError: (error) => notifyGeneralFormError(error, UI_MESSAGES.COULD_NOT_DELETE_FOLDER),
  });
  const deleteNoteMutation = useMutation({
    mutationFn: (id: string) => globalLoading.trackPromise(deleteNote(id)),
    onSuccess: async () => {
      setConfirmState(null);
      notifySuccess(UI_MESSAGES.NOTE_DELETED);
      await refreshDashboard(queryClient);
    },
    onError: (error) => notifyGeneralFormError(error, UI_MESSAGES.COULD_NOT_DELETE_NOTE),
  });

  return (
    <>
      <PageHead
        title={(
          <div className="page-head-title-row">
            <h1>{UI_MESSAGES.PROJECTS}</h1>
            <label className="sr-only" htmlFor="projects-page-project-select">{UI_MESSAGES.SELECT_PROJECT}</label>
            <Select
              ariaLabel={UI_MESSAGES.SELECT_PROJECT}
              className="page-head-select"
              id="projects-page-project-select"
              options={[
                { value: '', label: UI_MESSAGES.ALL },
                ...dashboard.projects.map((project) => ({
                  value: project.projectSlug,
                  label: project.displayName,
                })),
              ]}
              value={selected?.projectSlug || ''}
              onChange={openProject}
            />
            <label className="sr-only" htmlFor="projects-page-status-select">{UI_MESSAGES.FILTER_BY_STATUS}</label>
            <Select
              ariaLabel={UI_MESSAGES.FILTER_BY_STATUS}
              className="page-head-select status-select"
              id="projects-page-status-select"
              options={statusOptions}
              value={timelineStatus}
              onChange={(nextValue) => setTimelineStatus(nextValue as NoteStatusFilter)}
            />
          </div>
        )}
        subtitle=""
        action={
          <div style={{ display: 'flex', gap: '8px' }}>
            {createNote ? (
              <button className="icon-button" type="button" onClick={() => createNote()}>
                {UI_MESSAGES.QUICK_NOTE}
              </button>
            ) : null}
            <button className="icon-button" type="button" onClick={() => setProjectModal({ mode: 'create' })}>
              {UI_MESSAGES.NEW_PROJECT}
            </button>
          </div>
        }
      />

      {/* Search input for filtering notes within the selected project */}
      <section className="search-box projects-search-box">
        <SearchIcon className="projects-search-icon" />
        <input
          aria-label={UI_MESSAGES.SEARCH_NOTES_IN_PROJECT}
          autoComplete="off"
          enterKeyHint="search"
          inputMode="search"
          spellCheck={false}
          type="text"
          value={searchInput}
          onChange={(event) => setSearchInput(event.target.value)}
          placeholder={selected ? `${PROJECTS_WORKSPACE_MESSAGES.SEARCH.IN_PROJECT.replace('{project}', selected.displayName)}...` : PROJECTS_WORKSPACE_MESSAGES.SEARCH.ACROSS_ALL}
        />
      </section>

      <div className={`knowledge-map-container-layout${sideNoteId ? ' has-drawer' : ''} spaced`}>
        <div style={{ minWidth: 0 }}>
          {hasSearchQuery ? (
            /* Search results mode */
            <Panel className="matching-notes-panel" style={{ minWidth: 0 }}>
              <div className="matching-notes-heading">
                <div>
                  <h2>{UI_MESSAGES.SEARCH_RESULTS}</h2>
                  <span className="matching-notes-count">
                    {searchPagination ? `${searchPagination.total} ${UI_MESSAGES.TOTAL}` : ''}
                    {selected ? ` in ${selected.displayName}` : ' across all projects'}
                  </span>
                </div>
              </div>
              {searchQuery.isError ? <InlineMessage tone="error">{UI_MESSAGES.COULD_NOT_LOAD_NOTES_FOR_SEARCH}</InlineMessage> : null}
              <div className={`project-timeline-list ${searchQuery.isPlaceholderData ? 'stale-data' : ''}`}>
                {paginatedSearchResults.map((item) => (
                  <ProjectTimelineCard
                    key={item.id}
                    item={item}
                    dashboard={dashboard}
                    isPinPending={searchPinMutation.isPending}
                    onOpen={handleOpenNote}
                    onOpenFullPage={openNote}
                    onEdit={() => loadNoteMutation.mutate(item.noteId)}
                    onDelete={(note) => setConfirmState({ kind: 'note', note })}
                    onPin={(noteId, pinned) => searchPinMutation.mutate({ noteId, pinned })}
                  />
                ))}
              </div>
              {searchPagination ? (
                isSearchMobilePagination
                  ? <MobileInfinitePagination pagination={searchPagination} isLoading={searchQuery.isFetching || searchPagination.page > searchLoadedMobilePage} onPageChange={setSearchPage} />
                  : <Pagination pagination={searchPagination} onPageChange={setSearchPage} />
              ) : null}
              {!paginatedSearchResults.length && !searchQuery.isError ? <EmptyState>{UI_MESSAGES.NO_NOTES_FOUND_FOR_SEARCH}</EmptyState> : null}
            </Panel>
          ) : isAllProjectsSelected ? (
            <Panel>
              <div className="page-head">
                <div>
                  <h2>{UI_MESSAGES.ALL}</h2>
                  <p>{UI_MESSAGES.NOTES_FROM_ALL_PROJECTS}</p>
                </div>
              </div>
              <ProjectTimeline
                dashboard={dashboard}
                items={allProjectsTimelineQuery.data?.timeline || []}
                pagination={allProjectsTimelineQuery.data?.pagination}
                category={timelineCategory}
                onCategoryChange={(category) => {
                  setTimelineCategory(category);
                  timelinePagination.setPage(1);
                }}
                status={timelineStatus}
                onStatusChange={setTimelineStatus}
                onDeleteNote={(note) => setConfirmState({ kind: 'note', note })}
                onEditNote={(note) => loadNoteMutation.mutate(note.id)}
                onOpenNote={handleOpenNote}
                onOpenNoteFullPage={openNote}
                onPageChange={timelinePagination.setPage}
                isStale={allProjectsTimelineQuery.isPlaceholderData}
                resetKey={`all:${timelineCategory}:${timelineStatus}:timeline`}
                allowPin={false}
              />
            </Panel>
          ) : selected ? (
            <ProjectsBrowser
              dashboard={dashboard}
              project={selected}
              folderTree={folderTree}
              selectedFolderId={selectedFolderId}
              selectedFolder={selectedFolder}
              timelineItems={timelineItems}
              timelineCategory={timelineCategory}
              timelineStatus={timelineStatus}
              timelinePagination={timelineQuery.data?.pagination}
              onTimelineCategoryChange={(category) => {
                setTimelineCategory(category);
                timelinePagination.setPage(1);
              }}
              onTimelineStatusChange={setTimelineStatus}
              onTimelinePageChange={timelinePagination.setPage}
              onFolderSelect={(folderId) => {
                setSelectedFolderId(folderId);
                timelinePagination.setPage(1);
              }}
              onCreateNote={() => setNoteModal({ mode: 'create', projectSlug: selected.projectSlug, folderId: selectedFolderId || undefined })}
              onCreateFolder={() => setFolderModal({ mode: 'create', projectSlug: selected.projectSlug, parentFolderId: selectedFolder?.id })}
              onEditFolder={() => selectedFolder ? setFolderModal({ mode: 'edit', projectSlug: selected.projectSlug, folder: selectedFolder }) : undefined}
              onDeleteFolder={() => selectedFolder ? setConfirmState({ kind: 'folder', projectSlug: selected.projectSlug, folder: selectedFolder }) : undefined}
              onEditNote={(note) => loadNoteMutation.mutate(note.id)}
              onDeleteNote={(note) => setConfirmState({ kind: 'note', note })}
              onOpenNote={handleOpenNote}
              onOpenNoteFullPage={openNote}
              onEditProject={selected.projectSlug === 'inbox' ? undefined : () => setProjectModal({ mode: 'edit', project: selected })}
              onDeleteProject={selectedProjectDeleteBlockedReason ? undefined : () => setConfirmState({ kind: 'project', project: selected })}
              deleteProjectLabel={selectedProjectDeleteBlockedReason || 'Delete project'}
              isStale={timelineQuery.isPlaceholderData}
              timelineResetKey={`${selected.projectSlug}:${selectedFolderId}:${timelineCategory}:${timelineStatus}:timeline`}
            />
          ) : null}
        </div>
        {sideNoteId && (
          <SideNoteDrawer
            noteId={sideNoteId}
            dashboardProjects={dashboard.projects}
            onClose={() => setSideNoteId(null)}
            onOpenFullPage={openNote}
          />
        )}
      </div>
      {projectModal ? (
        <ProjectModal
          githubConnected={githubConnected}
          workspaceRepositories={workspaceRepositories}
          mode={projectModal.mode}
          project={projectModal.mode === 'edit' ? projectModal.project : undefined}
          onClose={() => setProjectModal(null)}
          onSaved={async (projectSlug, mode) => {
            setProjectModal(null);
            notifySuccess(mode === 'create' ? UI_MESSAGES.PROJECT_CREATED : UI_MESSAGES.PROJECT_UPDATED);
            openProject(projectSlug);
            await refreshDashboard(queryClient);
          }}
        />
      ) : null}
      {folderModal ? (
        <ProjectFolderModal
          folders={flatFolders}
          mode={folderModal.mode}
          folder={folderModal.mode === 'edit' ? folderModal.folder : undefined}
          initialParentFolderId={folderModal.mode === 'create' ? folderModal.parentFolderId : undefined}
          onClose={() => setFolderModal(null)}
          onSaved={async (folderId, mode) => {
            setFolderModal(null);
            setSelectedFolderId(folderId || ROOT_FOLDER_ID);
            notifySuccess(mode === 'create' ? UI_MESSAGES.FOLDER_CREATED : UI_MESSAGES.FOLDER_UPDATED);
            await refreshDashboard(queryClient);
          }}
          projectSlug={folderModal.projectSlug}
        />
      ) : null}
       {noteModal ? (
        <ProjectNoteModal
          folders={flatFolders}
          mode={noteModal.mode}
          note={noteModal.mode === 'edit' ? noteModal.note : undefined}
          onClose={() => setNoteModal(null)}
          onSaved={async (noteId, mode) => {
            setNoteModal(null);
            notifySuccess(mode === 'create' ? UI_MESSAGES.NOTE_CREATED : UI_MESSAGES.NOTE_UPDATED);
            await refreshDashboard(queryClient);
          }}
          projectSlug={noteModal.mode === 'edit' ? noteModal.note.project : noteModal.projectSlug}
          initialFolderId={noteModal.mode === 'edit' ? noteModal.note.folderId || undefined : noteModal.folderId}
          projects={dashboard.projects}
          workspaceSlug={workspaceSlug}
        />
      ) : null}
      {confirmState ? (
        <ConfirmationModal
          busy={deleteProjectMutation.isPending || deleteFolderMutation.isPending || deleteNoteMutation.isPending}
          cancelLabel={UI_MESSAGES.CANCEL}
          confirmLabel={UI_MESSAGES.CONFIRM_DELETION}
          description={confirmState.kind === 'project'
            ? PROJECTS_WORKSPACE_MESSAGES.CONFIRMATION.DELETE_PROJECT.replace('{displayName}', confirmState.project.displayName)
            : confirmState.kind === 'folder'
              ? PROJECTS_WORKSPACE_MESSAGES.CONFIRMATION.DELETE_FOLDER.replace('{displayName}', confirmState.folder.displayName)
              : PROJECTS_WORKSPACE_MESSAGES.CONFIRMATION.DELETE_NOTE.replace('{title}', confirmState.note.title)}
          onCancel={() => setConfirmState(null)}
          onConfirm={() => {
            if (confirmState.kind === 'project') {
              deleteProjectMutation.mutate(confirmState.project.projectSlug);
              return;
            }
            if (confirmState.kind === 'folder') {
              deleteFolderMutation.mutate({ projectSlug: confirmState.projectSlug, folderId: confirmState.folder.id });
              return;
            }
            deleteNoteMutation.mutate(confirmState.note.id);
          }}
          title={confirmState.kind === 'project' ? UI_MESSAGES.DELETE_PROJECT : confirmState.kind === 'folder' ? UI_MESSAGES.DELETE_FOLDER : UI_MESSAGES.DELETE_NOTE}
        />
      ) : null}
    </>
  );
}

async function refreshDashboard(queryClient: ReturnType<typeof useQueryClient>) {
  await invalidateNoteRelatedQueries(queryClient);
}

function deriveTimelineCategory(source: string | undefined): string {
  if (!source) return SOURCE_VALUES.MANUAL;
  const s = source.toLowerCase();
  if (s.includes('github')) return SOURCE_VALUES.GITHUB_PUSH;
  if (s.includes('whatsapp') || s.includes('evolution')) return SOURCE_VALUES.WHATSAPP_CHANNEL;
  if (s === SOURCE_VALUES.AI_CHAT || s.includes('antigravity') || s.includes('codex') || s.includes('claude') || s.includes('opencode') || s.includes('open-code')) return SOURCE_VALUES.AI_CHAT;
  return SOURCE_VALUES.MANUAL;
}
