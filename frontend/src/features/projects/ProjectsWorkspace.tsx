import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';

import type { ProjectsPageContext } from '../../app/page-context';
import {
  deleteNote,
  deleteProject,
  deleteProjectFolder,
  fetchNote,
  fetchNotes,
  fetchProjectFolders,
  fetchProjects,
} from '../../shared/api/client';
import { fetchGithubRepositories, fetchIntegrations } from '../../shared/api/integrations';
import { notifyGeneralFormError } from '../../shared/forms/errors';
import { notifySuccess } from '../../shared/ui/notifications';
import { ConfirmationModal } from '../../shared/ui/confirmation-modal';
import { Pagination } from '../../shared/ui/pagination';
import { PageHead } from '../../shared/ui/primitives';
import { usePaginationState } from '../../shared/ui/use-pagination-state';
import { ProjectCard } from '../../widgets/projects/ProjectCard';
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
  setSelectedProject,
  openNote,
}: ProjectsWorkspaceProps) {
  const params = useParams();
  const queryClient = useQueryClient();
  const [projectModal, setProjectModal] = useState<ProjectModalState | null>(null);
  const [folderModal, setFolderModal] = useState<FolderModalState | null>(null);
  const [noteModal, setNoteModal] = useState<NoteModalState | null>(null);
  const [confirmState, setConfirmState] = useState<ConfirmState | null>(null);
  const [selectedFolderId, setSelectedFolderId] = useState(ROOT_FOLDER_ID);
  const routeProject = params.projectSlug ? decodeURIComponent(params.projectSlug) : '';
  const selectedSlug = routeProject || selectedProject;
  const projectPagination = usePaginationState(selectedSlug);
  const projectsQuery = useQuery({
    queryKey: ['projects', selectedSlug, projectPagination.page],
    queryFn: () => fetchProjects({ page: projectPagination.page, selectedSlug }),
    initialData: {
      ok: true as const,
      projects: dashboard.projects.slice(0, 10),
      pagination: {
        page: 1,
        pageSize: 10,
        total: dashboard.projects.length,
        totalPages: Math.max(1, Math.ceil(dashboard.projects.length / 10)),
        hasNext: dashboard.projects.length > 10,
        hasPrevious: false,
      },
    },
  });
  const selected = projectsQuery.data?.projects.find((project) => project.projectSlug === selectedSlug)
    || projectsQuery.data?.projects[0]
    || dashboard.projects.find((project) => project.projectSlug === selectedSlug)
    || dashboard.projects[0];

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
    initialData: selected && dashboard.notes && !selectedFolderId
      ? {
          ok: true as const,
          notes: dashboard.notes.filter((note) => note.project === selected.projectSlug && !note.folderId).slice(0, 10),
          pagination: {
            page: 1,
            pageSize: 10,
            total: dashboard.notes.filter((note) => note.project === selected.projectSlug && !note.folderId).length,
            totalPages: Math.max(1, Math.ceil(dashboard.notes.filter((note) => note.project === selected.projectSlug && !note.folderId).length / 10)),
            hasNext: dashboard.notes.filter((note) => note.project === selected.projectSlug && !note.folderId).length > 10,
            hasPrevious: false,
          },
        }
      : undefined,
  });
  const notes = notesQuery.data?.notes || [];
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
    mutationFn: (id: string) => fetchNote(id),
    onSuccess: (note) => setNoteModal({ mode: 'edit', note }),
    onError: (error) => notifyGeneralFormError(error, 'Nao foi possivel carregar a nota para edicao.'),
  });
  const deleteProjectMutation = useMutation({
    mutationFn: (projectSlug: string) => deleteProject(projectSlug),
    onSuccess: async (_, projectSlug) => {
      const nextProjectSlug = (projectsQuery.data?.projects || dashboard.projects).filter((project) => project.projectSlug !== projectSlug)[0]?.projectSlug || 'inbox';
      setConfirmState(null);
      notifySuccess('Projeto excluido com sucesso.');
      setSelectedProject(nextProjectSlug);
      await refreshDashboard(queryClient);
    },
    onError: (error) => notifyGeneralFormError(error, 'Nao foi possivel excluir o projeto.'),
  });
  const deleteFolderMutation = useMutation({
    mutationFn: ({ projectSlug, folderId }: { projectSlug: string; folderId: string }) => deleteProjectFolder(projectSlug, folderId),
    onSuccess: async () => {
      setConfirmState(null);
      setSelectedFolderId(ROOT_FOLDER_ID);
      notifySuccess('Pasta excluida com sucesso.');
      await refreshDashboard(queryClient);
    },
    onError: (error) => notifyGeneralFormError(error, 'Nao foi possivel excluir a pasta.'),
  });
  const deleteNoteMutation = useMutation({
    mutationFn: (id: string) => deleteNote(id),
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
        title="Projetos"
        subtitle=""
        action={<button className="icon-button" type="button" onClick={() => setProjectModal({ mode: 'create' })}>Novo projeto</button>}
      />
      <section className="grid cols-3">
        {(projectsQuery.data?.projects || []).map((project) => {
          const deleteBlockedReason = project.projectSlug === 'inbox'
            ? 'Inbox nao pode ser alterado.'
            : project.projectSlug === selected?.projectSlug && (notesQuery.data?.pagination.total || 0) > 0
              ? 'Exclua ou mova as notas do projeto antes de remover.'
              : '';

          return (
            <ProjectCard
              key={project.projectSlug}
              deleteDisabled={Boolean(deleteBlockedReason)}
              deleteLabel={deleteBlockedReason}
              onDelete={(item) => setConfirmState({ kind: 'project', project: item })}
              onEdit={project.projectSlug === 'inbox' ? undefined : (item) => setProjectModal({ mode: 'edit', project: item })}
              onOpen={setSelectedProject}
              project={project}
            />
          );
        })}
      </section>
      {projectsQuery.data ? <Pagination pagination={projectsQuery.data.pagination} onPageChange={projectPagination.setPage} /> : null}
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
          onCreateFolder={() => setFolderModal({ mode: 'create', projectSlug: selected.projectSlug })}
          onCreateSubfolder={() => selectedFolder ? setFolderModal({ mode: 'create', projectSlug: selected.projectSlug, parentFolderId: selectedFolder.id }) : undefined}
          onEditFolder={() => selectedFolder ? setFolderModal({ mode: 'edit', projectSlug: selected.projectSlug, folder: selectedFolder }) : undefined}
          onDeleteFolder={() => selectedFolder ? setConfirmState({ kind: 'folder', projectSlug: selected.projectSlug, folder: selectedFolder }) : undefined}
          onEditNote={(note) => loadNoteMutation.mutate(note.id)}
          onDeleteNote={(note) => setConfirmState({ kind: 'note', note })}
          onOpenNote={openNote}
          onNotesPageChange={notesPagination.setPage}
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
            setSelectedProject(projectSlug);
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
            if (noteId) {
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
