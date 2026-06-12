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
  runQuery,
} from '../../shared/api/client';
import type { NoteSummary } from '../../shared/api/models/note';
import { fetchGithubRepositories, fetchIntegrations } from '../../shared/api/integrations';
import type { ProjectTimelineCategory } from '../../shared/api/models/project-timeline';
import { type NoteStatus } from '../../shared/api/models/note-status';
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
import { ProjectFolderModal } from './modals/ProjectFolderModal';
import { ProjectNoteModal } from './modals/ProjectNoteModal';
import { ProjectModal } from './modals/ProjectModal';
import { ProjectsBrowser } from './ProjectsBrowser';
import { flattenFolders } from './projects.helpers';
import type { ConfirmState, FolderModalState, NoteModalState, ProjectModalState } from './projects.types';
import { ProjectTimeline } from './ProjectTimeline';
import { SideNoteDrawer } from '../../widgets/notes/SideNoteDrawer';
import { NoteRow } from '../../widgets/notes/NoteRow';
import { SearchIcon } from '../../shared/ui/icons';

const SEARCH_DEBOUNCE_MS = 350;

const statusOptions: Array<{ value: '' | 'open' | NoteStatus; label: string }> = [
  { value: 'open', label: 'Open' },
  { value: '', label: 'All' },
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
  const [timelineStatus, setTimelineStatus] = useState<'' | 'open' | NoteStatus>('open');
  const [hiddenLatestBriefProjects, setHiddenLatestBriefProjects] = useState<Record<string, boolean>>({});
  const [sideNoteId, setSideNoteId] = useState<string | null>(null);

  // Search state
  const [searchInput, setSearchInput] = useState('');
  const debouncedSearchInput = useDebouncedValue(searchInput, SEARCH_DEBOUNCE_MS);
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
    queryKey: ['project-folders', selected?.projectSlug || ''],
    queryFn: () => fetchProjectFolders(selected?.projectSlug || ''),
    enabled: Boolean(selected?.projectSlug),
    initialData: selected ? { ok: true as const, projectSlug: selected.projectSlug, folders: [] } : undefined,
  });
  const folderTree = foldersQuery.data?.folders || [];
  const flatFolders = useMemo(() => flattenFolders(folderTree), [folderTree]);
  const selectedFolder = flatFolders.find((folder) => folder.id === selectedFolderId) || null;
  const timelinePagination = usePaginationState(`${selected?.projectSlug || 'all'}:${selectedFolderId}:${timelineCategory}:${timelineStatus}:timeline`);
  const allProjectsTimelineQuery = useQuery({
    queryKey: ['project-timeline', 'all-projects', timelineCategory, timelineStatus, timelinePagination.page],
    queryFn: () => fetchAllProjectsTimeline({
      page: timelinePagination.page,
      category: timelineCategory,
      status: timelineStatus,
    }),
    enabled: isAllProjectsSelected && !hasSearchQuery,
    staleTime: timelineCategory === 'all' ? 30_000 : 0,
    placeholderData: keepPreviousData,
  });
  const timelineQuery = useQuery({
    queryKey: ['project-timeline', selected?.projectSlug || '', selectedFolderId, timelineCategory, timelineStatus, timelinePagination.page],
    queryFn: () => fetchProjectTimeline(selected?.projectSlug || '', {
      page: timelinePagination.page,
      category: timelineCategory,
      folderId: selectedFolderId || undefined,
      status: timelineStatus,
    }),
    enabled: Boolean(selected?.projectSlug) && !hasSearchQuery,
    staleTime: timelineCategory === 'all' ? 30_000 : 0,
    placeholderData: keepPreviousData,
  });

  // Search query — scoped to the selected project
  const searchPaginationKey = `search:${debouncedSearchInput}:${selectedSlug}:${timelineStatus}`;
  const { page: searchPage, setPage: setSearchPage } = usePaginationState(searchPaginationKey);
  const searchQuery = useQuery({
    queryKey: ['projects-search', debouncedSearchInput, selectedSlug, workspaceSlug, timelineStatus, searchPage],
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

  const searchResults: NoteSummary[] = useMemo(() => {
    if (!searchQuery.data?.matches) return [];
    return searchQuery.data.matches.map((match) => ({
      ...match,
      attachmentCount: match.attachmentCount || 0,
      folderId: null,
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
    ? 'Inbox cannot be changed.'
    : dashboardNotes.some((note) => note.project === selected?.projectSlug)
      ? 'Delete or move the project notes before removing it.'
      : '';
  const { data: integrationsResponse } = useQuery({
    queryKey: ['integrations', workspaceSlug],
    queryFn: () => fetchIntegrations(workspaceSlug || ''),
    enabled: Boolean(workspaceSlug),
  });
  const githubConnected = integrationsResponse?.integrations.some(
    (integration) => integration.provider === 'github-app' && integration.status === 'connected',
  ) || false;
  const { data: repositoriesResponse } = useQuery({
    queryKey: ['github-repositories', workspaceSlug],
    queryFn: () => fetchGithubRepositories(workspaceSlug || ''),
    enabled: Boolean(workspaceSlug) && githubConnected,
  });
  const workspaceRepositories = repositoriesResponse?.repositories || [];
  const loadNoteMutation = useMutation({
    mutationFn: (id: string) => globalLoading.trackPromise(ensureNoteDetail(queryClient, id)),
    onSuccess: (note) => setNoteModal({ mode: 'edit', note }),
    onError: (error) => notifyGeneralFormError(error, 'Could not load the note for editing.'),
  });
  const deleteProjectMutation = useMutation({
    mutationFn: (projectSlug: string) => globalLoading.trackPromise(deleteProject(projectSlug)),
    onSuccess: async (_, projectSlug) => {
      const nextProjectSlug = dashboard.projects.filter((project) => project.projectSlug !== projectSlug)[0]?.projectSlug || 'inbox';
      setConfirmState(null);
      notifySuccess('Project deleted successfully.');
      openProject(nextProjectSlug);
      await refreshDashboard(queryClient);
    },
    onError: (error) => notifyGeneralFormError(error, 'Could not delete the project.'),
  });
  const deleteFolderMutation = useMutation({
    mutationFn: ({ projectSlug, folderId }: { projectSlug: string; folderId: string }) => globalLoading.trackPromise(deleteProjectFolder(projectSlug, folderId)),
    onSuccess: async () => {
      setConfirmState(null);
      setSelectedFolderId(ROOT_FOLDER_ID);
      notifySuccess('Folder deleted successfully.');
      await refreshDashboard(queryClient);
    },
    onError: (error) => notifyGeneralFormError(error, 'Could not delete the folder.'),
  });
  const deleteNoteMutation = useMutation({
    mutationFn: (id: string) => globalLoading.trackPromise(deleteNote(id)),
    onSuccess: async () => {
      setConfirmState(null);
      notifySuccess('Note deleted successfully.');
      await refreshDashboard(queryClient);
    },
    onError: (error) => notifyGeneralFormError(error, 'Could not delete the note.'),
  });

  return (
    <>
      <PageHead
        title={(
          <div className="page-head-title-row">
            <h1>Projects</h1>
            <label className="sr-only" htmlFor="projects-page-project-select">Select project</label>
            <Select
              ariaLabel="Select project"
              className="page-head-select"
              id="projects-page-project-select"
              options={[
                { value: '', label: 'All' },
                ...dashboard.projects.map((project) => ({
                  value: project.projectSlug,
                  label: project.displayName,
                })),
              ]}
              value={selected?.projectSlug || ''}
              onChange={openProject}
            />
            <label className="sr-only" htmlFor="projects-page-status-select">Filter by status</label>
            <Select
              ariaLabel="Filter by status"
              className="page-head-select status-select"
              id="projects-page-status-select"
              options={statusOptions}
              value={timelineStatus}
              onChange={(nextValue) => setTimelineStatus(nextValue as '' | 'open' | NoteStatus)}
            />
          </div>
        )}
        subtitle=""
        action={<button className="icon-button" type="button" onClick={() => setProjectModal({ mode: 'create' })}>New project</button>}
      />

      {/* Search input for filtering notes within the selected project */}
      <section className="search-box projects-search-box">
        <SearchIcon className="projects-search-icon" />
        <input
          aria-label="Search notes in project"
          autoComplete="off"
          enterKeyHint="search"
          inputMode="search"
          spellCheck={false}
          type="text"
          value={searchInput}
          onChange={(event) => setSearchInput(event.target.value)}
          placeholder={selected ? `Search in ${selected.displayName}...` : 'Search across all projects...'}
        />
      </section>

      <div className={`knowledge-map-container-layout${sideNoteId ? ' has-drawer' : ''} spaced`}>
        <div style={{ minWidth: 0 }}>
          {hasSearchQuery ? (
            /* Search results mode */
            <Panel className="matching-notes-panel" style={{ minWidth: 0 }}>
              <div className="matching-notes-heading">
                <div>
                  <h2>Search Results</h2>
                  <span className="matching-notes-count">
                    {searchPagination ? `${searchPagination.total} total` : ''}
                    {selected ? ` in ${selected.displayName}` : ' across all projects'}
                  </span>
                </div>
              </div>
              {searchQuery.isError ? <InlineMessage tone="error">Could not load notes for this search.</InlineMessage> : null}
              <div className={`list ${searchQuery.isPlaceholderData ? 'stale-data' : ''}`}>
                {paginatedSearchResults.map((note) => (
                  <NoteRow
                    key={note.id}
                    note={note}
                    dashboard={dashboard}
                    onDelete={() => setConfirmState({ kind: 'note', note })}
                    onEdit={() => loadNoteMutation.mutate(note.id)}
                    onOpen={handleOpenNote}
                    onDoubleClick={openNote}
                    onPinSuccess={() => setSearchPage(1)}
                  />
                ))}
              </div>
              {searchPagination ? (
                isSearchMobilePagination
                  ? <MobileInfinitePagination pagination={searchPagination} isLoading={searchQuery.isFetching || searchPagination.page > searchLoadedMobilePage} onPageChange={setSearchPage} />
                  : <Pagination pagination={searchPagination} onPageChange={setSearchPage} />
              ) : null}
              {!paginatedSearchResults.length && !searchQuery.isError ? <EmptyState>No notes found for this search.</EmptyState> : null}
            </Panel>
          ) : isAllProjectsSelected ? (
            <Panel>
              <div className="page-head">
                <div>
                  <h2>All</h2>
                  <p>Notes from all projects</p>
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
            notifySuccess(mode === 'create' ? 'Project created successfully.' : 'Project updated successfully.');
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
            notifySuccess(mode === 'create' ? 'Folder created successfully.' : 'Folder updated successfully.');
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
            notifySuccess(mode === 'create' ? 'Note created successfully.' : 'Note updated successfully.');
            await refreshDashboard(queryClient);
            if (mode === 'create' && noteId) {
              openNote(noteId);
            }
          }}
          projectSlug={noteModal.mode === 'edit' ? noteModal.note.project : noteModal.projectSlug}
          initialFolderId={noteModal.mode === 'edit' ? noteModal.note.folderId || undefined : noteModal.folderId}
        />
      ) : null}
      {confirmState ? (
        <ConfirmationModal
          busy={deleteProjectMutation.isPending || deleteFolderMutation.isPending || deleteNoteMutation.isPending}
          cancelLabel="Cancel"
          confirmLabel="Confirm deletion"
          description={confirmState.kind === 'project'
            ? `Deleting project ${confirmState.project.displayName} is permanent.`
            : confirmState.kind === 'folder'
              ? `Folder ${confirmState.folder.displayName} will only be removed if it is empty.`
              : `Deleting note ${confirmState.note.title} also removes its linked reminder, when present.`}
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
          title={confirmState.kind === 'project' ? 'Delete project' : confirmState.kind === 'folder' ? 'Delete folder' : 'Delete note'}
        />
      ) : null}
    </>
  );
}

async function refreshDashboard(queryClient: ReturnType<typeof useQueryClient>) {
  await invalidateNoteRelatedQueries(queryClient);
}
