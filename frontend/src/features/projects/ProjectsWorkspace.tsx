import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';

import type { ProjectsPageContext } from '../../app/page-context';
import {
  deleteNote,
  deleteProject,
  deleteProjectFolder,
  fetchAllProjectsTimeline,
  fetchLatestProjectBrief,
  fetchProjectFolders,
  fetchProjectTimeline,
  generateProjectBrief,
} from '../../shared/api/client';
import type { ProjectBriefPanelResponse } from '../../shared/api/models/project-brief';
import { fetchGithubRepositories, fetchIntegrations } from '../../shared/api/integrations';
import { getErrorMessage } from '../../shared/api/error-message';
import type { ProjectTimelineCategory } from '../../shared/api/models/project-timeline';
import { ensureNoteDetail, invalidateNoteRelatedQueries } from '../../shared/api/note-query';
import { notifyGeneralFormError } from '../../shared/forms/errors';
import { notifySuccess } from '../../shared/ui/notifications';
import { ConfirmationModal } from '../../shared/ui/confirmation-modal';
import { PageHead, Panel } from '../../shared/ui/primitives';
import { Select } from '../../shared/ui/select';
import { usePaginationState } from '../../shared/ui/use-pagination-state';
import { useGlobalLoading } from '../../app/global-loading';
import { ROOT_FOLDER_ID } from './projects.constants';
import { ProjectFolderModal } from './modals/ProjectFolderModal';
import { ProjectNoteModal } from './modals/ProjectNoteModal';
import { ProjectModal } from './modals/ProjectModal';
import { ProjectsBrowser } from './ProjectsBrowser';
import { flattenFolders } from './projects.helpers';
import type { ConfirmState, FolderModalState, NoteModalState, ProjectModalState } from './projects.types';
import { ProjectTimeline } from './ProjectTimeline';
import { SideNoteDrawer } from '../../widgets/notes/SideNoteDrawer';


type ProjectsWorkspaceProps = ProjectsPageContext;

export function ProjectsWorkspace({
  dashboard,
  selectedProject,
  openProject,
  openNote,
}: ProjectsWorkspaceProps) {
  const params = useParams();
  const queryClient = useQueryClient();
  const globalLoading = useGlobalLoading();
  const [projectModal, setProjectModal] = useState<ProjectModalState | null>(null);
  const [folderModal, setFolderModal] = useState<FolderModalState | null>(null);
  const [noteModal, setNoteModal] = useState<NoteModalState | null>(null);
  const [confirmState, setConfirmState] = useState<ConfirmState | null>(null);
  const [selectedFolderId, setSelectedFolderId] = useState(ROOT_FOLDER_ID);
  const [timelineCategory, setTimelineCategory] = useState<ProjectTimelineCategory>('all');
  const [hiddenLatestBriefProjects, setHiddenLatestBriefProjects] = useState<Record<string, boolean>>({});
  const [sideNoteId, setSideNoteId] = useState<string | null>(null);
  const routeProject = params.projectSlug ? decodeURIComponent(params.projectSlug) : '';
  const selectedSlug = routeProject || selectedProject;
  const dashboardNotes = dashboard.notes || [];
  const selected = selectedSlug
    ? dashboard.projects.find((project) => project.projectSlug === selectedSlug) || dashboard.projects[0]
    : undefined;
  const isAllProjectsSelected = !selectedSlug;

  useEffect(() => {
    setSelectedFolderId(ROOT_FOLDER_ID);
  }, [selected?.projectSlug]);

  const foldersQuery = useQuery({
    queryKey: ['project-folders', selected?.projectSlug || ''],
    queryFn: () => fetchProjectFolders(selected?.projectSlug || ''),
    enabled: Boolean(selected?.projectSlug),
    initialData: selected ? { ok: true as const, projectSlug: selected.projectSlug, folders: [] } : undefined,
  });
  const folderTree = foldersQuery.data?.folders || [];
  const flatFolders = useMemo(() => flattenFolders(folderTree), [folderTree]);
  const selectedFolder = flatFolders.find((folder) => folder.id === selectedFolderId) || null;
  const timelinePagination = usePaginationState(`${selected?.projectSlug || 'all'}:${selectedFolderId}:${timelineCategory}:timeline`);
  const allProjectsTimelineQuery = useQuery({
    queryKey: ['project-timeline', 'all-projects', timelineCategory, timelinePagination.page],
    queryFn: () => fetchAllProjectsTimeline({
      page: timelinePagination.page,
      category: timelineCategory,
    }),
    enabled: isAllProjectsSelected,
    staleTime: timelineCategory === 'all' ? 30_000 : 0,
    placeholderData: keepPreviousData,
  });
  const timelineQuery = useQuery({
    queryKey: ['project-timeline', selected?.projectSlug || '', selectedFolderId, timelineCategory, timelinePagination.page],
    queryFn: () => fetchProjectTimeline(selected?.projectSlug || '', {
      page: timelinePagination.page,
      category: timelineCategory,
      folderId: selectedFolderId || undefined,
    }),
    enabled: Boolean(selected?.projectSlug),
    staleTime: timelineCategory === 'all' ? 30_000 : 0,
    placeholderData: keepPreviousData,
  });
  const briefQueryKey = ['project-brief', selected?.projectSlug || ''];
  const latestBriefQuery = useQuery<ProjectBriefPanelResponse>({
    queryKey: briefQueryKey,
    queryFn: () => fetchLatestProjectBrief(selected?.projectSlug || ''),
    enabled: false,
  });
  const timelineItems = timelineQuery.data?.timeline || [];
  const selectedProjectDeleteBlockedReason = selected?.projectSlug === 'inbox'
    ? 'Inbox cannot be changed.'
    : dashboardNotes.some((note) => note.project === selected?.projectSlug)
      ? 'Delete or move the project notes before removing it.'
      : '';
  const workspaceSlug = dashboard.workspaces[0]?.workspaceSlug;
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
  const generateBriefMutation = useMutation({
    mutationFn: (projectSlug: string) => generateProjectBrief(projectSlug),
    onSuccess: (response, projectSlug) => {
      queryClient.setQueryData<ProjectBriefPanelResponse>(['project-brief', projectSlug], response);
      setHiddenLatestBriefProjects((current) => ({ ...current, [projectSlug]: false }));
    },
    onError: (error) => notifyGeneralFormError(error, 'Could not generate the project brief.'),
  });
  const showLatestBrief = () => {
    if (!selected?.projectSlug) return;
    const currentBrief = latestBriefQuery.data;
    if (currentBrief && 'source' in currentBrief && currentBrief.source === 'history' && !hiddenLatestBriefProjects[selected.projectSlug]) {
      setHiddenLatestBriefProjects((current) => ({ ...current, [selected.projectSlug]: true }));
      return;
    }
    setHiddenLatestBriefProjects((current) => ({ ...current, [selected.projectSlug]: false }));
    if (currentBrief && 'source' in currentBrief && currentBrief.source === 'history') return;
    void latestBriefQuery.refetch();
  };
  const selectedBriefResponse = selected && hiddenLatestBriefProjects[selected.projectSlug] && latestBriefQuery.data && 'source' in latestBriefQuery.data && latestBriefQuery.data.source === 'history'
    ? undefined
    : latestBriefQuery.data;

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
          </div>
        )}
        subtitle=""
        action={<button className="icon-button" type="button" onClick={() => setProjectModal({ mode: 'create' })}>New project</button>}
      />
      <div className={`knowledge-map-container-layout${sideNoteId ? ' has-drawer' : ''} spaced`}>
        <div style={{ minWidth: 0 }}>
          {isAllProjectsSelected ? (
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
                onDeleteNote={(note) => setConfirmState({ kind: 'note', note })}
                onEditNote={(note) => loadNoteMutation.mutate(note.id)}
                onOpenNote={setSideNoteId}
                onPageChange={timelinePagination.setPage}
                isStale={allProjectsTimelineQuery.isPlaceholderData}
                resetKey={`all:${timelineCategory}:timeline`}
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
              briefResponse={selectedBriefResponse}
              briefLoading={generateBriefMutation.isPending && generateBriefMutation.variables === selected.projectSlug}
              briefHistoryLoading={latestBriefQuery.isFetching}
              briefError={generateBriefMutation.isError && generateBriefMutation.variables === selected.projectSlug
                ? getErrorMessage(generateBriefMutation.error, 'Could not generate the project brief.')
                : ''}
              briefHistoryError={latestBriefQuery.isError
                ? getErrorMessage(latestBriefQuery.error, 'Could not load the latest project brief.')
                : ''}
              timelineCategory={timelineCategory}
              timelinePagination={timelineQuery.data?.pagination}
              onTimelineCategoryChange={(category) => {
                setTimelineCategory(category);
                timelinePagination.setPage(1);
              }}
              onTimelinePageChange={timelinePagination.setPage}
              onFolderSelect={(folderId) => {
                setSelectedFolderId(folderId);
                timelinePagination.setPage(1);
              }}
              onGenerateBrief={() => generateBriefMutation.mutate(selected.projectSlug)}
              onShowLatestBrief={showLatestBrief}
              onCreateNote={() => setNoteModal({ mode: 'create', projectSlug: selected.projectSlug, folderId: selectedFolderId || undefined })}
              onCreateFolder={() => setFolderModal({ mode: 'create', projectSlug: selected.projectSlug, parentFolderId: selectedFolder?.id })}
              onEditFolder={() => selectedFolder ? setFolderModal({ mode: 'edit', projectSlug: selected.projectSlug, folder: selectedFolder }) : undefined}
              onDeleteFolder={() => selectedFolder ? setConfirmState({ kind: 'folder', projectSlug: selected.projectSlug, folder: selectedFolder }) : undefined}
              onEditNote={(note) => loadNoteMutation.mutate(note.id)}
              onDeleteNote={(note) => setConfirmState({ kind: 'note', note })}
              onOpenNote={setSideNoteId}
              onOpenNoteFullPage={openNote}
              onEditProject={selected.projectSlug === 'inbox' ? undefined : () => setProjectModal({ mode: 'edit', project: selected })}
              onDeleteProject={selectedProjectDeleteBlockedReason ? undefined : () => setConfirmState({ kind: 'project', project: selected })}
              deleteProjectLabel={selectedProjectDeleteBlockedReason || 'Delete project'}
              isStale={timelineQuery.isPlaceholderData}
              timelineResetKey={`${selected.projectSlug}:${selectedFolderId}:${timelineCategory}:timeline`}
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
  await queryClient.invalidateQueries({ queryKey: ['project-timeline'] });
  await queryClient.invalidateQueries({ queryKey: ['projects'] });
}
