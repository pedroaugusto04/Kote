import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';

import type { ProjectsPageContext } from '../../app/page-context';
import {
  deleteNote,
  deleteProject,
  deleteProjectFolder,
  fetchNotes,
  fetchProjectFolders,
} from '../../shared/api/client';
import { fetchGithubRepositories, fetchIntegrations } from '../../shared/api/integrations';
import { DEFAULT_PAGE_SIZE } from '../../shared/api/models/pagination';
import { ensureNoteDetail } from '../../shared/api/note-query';
import { notifyGeneralFormError } from '../../shared/forms/errors';
import { notifySuccess } from '../../shared/ui/notifications';
import { ConfirmationModal } from '../../shared/ui/confirmation-modal';
import { PageHead } from '../../shared/ui/primitives';
import { usePaginationState } from '../../shared/ui/use-pagination-state';
import { useGlobalLoading } from '../../app/global-loading';
import { ROOT_FOLDER_ID } from './projects.constants';
import { ProjectFolderModal } from './modals/ProjectFolderModal';
import { ProjectNoteModal } from './modals/ProjectNoteModal';
import { ProjectModal } from './modals/ProjectModal';
import { ProjectsBrowser } from './ProjectsBrowser';
import { flattenFolders } from './projects.helpers';
import type { ConfirmState, FolderModalState, NoteModalState, ProjectModalState } from './projects.types';

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
  const routeProject = params.projectSlug ? decodeURIComponent(params.projectSlug) : '';
  const selectedSlug = routeProject || selectedProject;
  const dashboardNotes = dashboard.notes || [];
  const selected = dashboard.projects.find((project) => project.projectSlug === selectedSlug) || dashboard.projects[0];

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
  const notesPagination = usePaginationState(`${selected?.projectSlug || ''}:${selectedFolderId}`);
  const notesQuery = useQuery({
    queryKey: ['notes', 'projects-page', selected?.projectSlug || '', selectedFolderId, notesPagination.page],
    queryFn: () => fetchNotes({
      page: notesPagination.page,
      projectSlug: selected?.projectSlug || '',
      folderId: selectedFolderId || undefined,
      rootOnly: !selectedFolderId,
    }),
    enabled: Boolean(selected?.projectSlug),
    initialData: selected && !selectedFolderId
      ? {
          ok: true as const,
          notes: dashboardNotes.filter((note) => note.project === selected.projectSlug && !note.folderId).slice(0, DEFAULT_PAGE_SIZE),
          pagination: {
            page: 1,
            pageSize: DEFAULT_PAGE_SIZE,
            total: dashboardNotes.filter((note) => note.project === selected.projectSlug && !note.folderId).length,
            totalPages: Math.max(1, Math.ceil(dashboardNotes.filter((note) => note.project === selected.projectSlug && !note.folderId).length / DEFAULT_PAGE_SIZE)),
            hasNext: dashboardNotes.filter((note) => note.project === selected.projectSlug && !note.folderId).length > DEFAULT_PAGE_SIZE,
            hasPrevious: false,
          },
        }
      : undefined,
  });
  const notes = notesQuery.data?.notes || [];
  const selectedProjectDeleteBlockedReason = selected?.projectSlug === 'inbox'
    ? 'Inbox nao pode ser alterado.'
    : dashboardNotes.some((note) => note.project === selected?.projectSlug)
      ? 'Exclua ou mova as notas do projeto antes de remover.'
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
    onError: (error) => notifyGeneralFormError(error, 'Nao foi possivel carregar a nota para edicao.'),
  });
  const deleteProjectMutation = useMutation({
    mutationFn: (projectSlug: string) => globalLoading.trackPromise(deleteProject(projectSlug)),
    onSuccess: async (_, projectSlug) => {
      const nextProjectSlug = dashboard.projects.filter((project) => project.projectSlug !== projectSlug)[0]?.projectSlug || 'inbox';
      setConfirmState(null);
      notifySuccess('Projeto excluido com sucesso.');
      openProject(nextProjectSlug);
      await refreshDashboard(queryClient);
    },
    onError: (error) => notifyGeneralFormError(error, 'Nao foi possivel excluir o projeto.'),
  });
  const deleteFolderMutation = useMutation({
    mutationFn: ({ projectSlug, folderId }: { projectSlug: string; folderId: string }) => globalLoading.trackPromise(deleteProjectFolder(projectSlug, folderId)),
    onSuccess: async () => {
      setConfirmState(null);
      setSelectedFolderId(ROOT_FOLDER_ID);
      notifySuccess('Pasta excluida com sucesso.');
      await refreshDashboard(queryClient);
    },
    onError: (error) => notifyGeneralFormError(error, 'Nao foi possivel excluir a pasta.'),
  });
  const deleteNoteMutation = useMutation({
    mutationFn: (id: string) => globalLoading.trackPromise(deleteNote(id)),
    onSuccess: async () => {
      setConfirmState(null);
      notifySuccess('Nota excluida com sucesso.');
      await refreshDashboard(queryClient);
    },
    onError: (error) => notifyGeneralFormError(error, 'Nao foi possivel excluir a nota.'),
  });

  return (
    <>
      <PageHead
        title={(
          <div className="page-head-title-row">
            <h1>Projetos</h1>
            <label className="sr-only" htmlFor="projects-page-project-select">Selecionar projeto</label>
            <select
              id="projects-page-project-select"
              className="page-head-select"
              value={selected?.projectSlug || ''}
              onChange={(event) => openProject(event.target.value)}
            >
              {dashboard.projects.map((project) => (
                <option key={project.projectSlug} value={project.projectSlug}>
                  {project.displayName}
                </option>
              ))}
            </select>
          </div>
        )}
        subtitle=""
        action={<button className="icon-button" type="button" onClick={() => setProjectModal({ mode: 'create' })}>Novo projeto</button>}
      />
      {selected ? (
        <ProjectsBrowser
          dashboard={dashboard}
          project={selected}
          folderTree={folderTree}
          selectedFolderId={selectedFolderId}
          selectedFolder={selectedFolder}
          notes={notes}
          notesPagination={notesQuery.data?.pagination}
          onFolderSelect={setSelectedFolderId}
          onCreateNote={() => setNoteModal({ mode: 'create', projectSlug: selected.projectSlug, folderId: selectedFolderId || undefined })}
          onCreateFolder={() => setFolderModal({ mode: 'create', projectSlug: selected.projectSlug, parentFolderId: selectedFolder?.id })}
          onEditFolder={() => selectedFolder ? setFolderModal({ mode: 'edit', projectSlug: selected.projectSlug, folder: selectedFolder }) : undefined}
          onDeleteFolder={() => selectedFolder ? setConfirmState({ kind: 'folder', projectSlug: selected.projectSlug, folder: selectedFolder }) : undefined}
          onEditNote={(note) => loadNoteMutation.mutate(note.id)}
          onDeleteNote={(note) => setConfirmState({ kind: 'note', note })}
          onOpenNote={openNote}
          onNotesPageChange={notesPagination.setPage}
          onEditProject={selected.projectSlug === 'inbox' ? undefined : () => setProjectModal({ mode: 'edit', project: selected })}
          onDeleteProject={selectedProjectDeleteBlockedReason ? undefined : () => setConfirmState({ kind: 'project', project: selected })}
          deleteProjectLabel={selectedProjectDeleteBlockedReason || 'Excluir projeto'}
        />
      ) : null}
      {projectModal ? (
        <ProjectModal
          githubConnected={githubConnected}
          workspaceRepositories={workspaceRepositories}
          mode={projectModal.mode}
          project={projectModal.mode === 'edit' ? projectModal.project : undefined}
          onClose={() => setProjectModal(null)}
          onSaved={async (projectSlug, mode) => {
            setProjectModal(null);
            notifySuccess(mode === 'create' ? 'Projeto criado com sucesso.' : 'Projeto atualizado com sucesso.');
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
            notifySuccess(mode === 'create' ? 'Pasta criada com sucesso.' : 'Pasta atualizada com sucesso.');
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
            notifySuccess(mode === 'create' ? 'Nota criada com sucesso.' : 'Nota atualizada com sucesso.');
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
          cancelLabel="Cancelar"
          confirmLabel="Confirmar exclusão"
          description={confirmState.kind === 'project'
            ? `A exclusao do projeto ${confirmState.project.displayName} e definitiva.`
            : confirmState.kind === 'folder'
              ? `A pasta ${confirmState.folder.displayName} so sera removida se estiver vazia.`
              : `A exclusao da nota ${confirmState.note.title} tambem remove o lembrete vinculado, quando existir.`}
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
          title={confirmState.kind === 'project' ? 'Excluir projeto' : confirmState.kind === 'folder' ? 'Excluir pasta' : 'Excluir nota'}
        />
      ) : null}
    </>
  );
}

async function refreshDashboard(queryClient: ReturnType<typeof useQueryClient>) {
  await queryClient.invalidateQueries({ queryKey: ['dashboard'] });
  await queryClient.invalidateQueries({ queryKey: ['projects'] });
  await queryClient.invalidateQueries({ queryKey: ['project-folders'] });
  await queryClient.invalidateQueries({ queryKey: ['notes'] });
}
