import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { zodResolver } from '@hookform/resolvers/zod';
import { useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { useParams } from 'react-router-dom';

import type { PageContext } from '../../app/page-context';
import { createNote, createProject, deleteNote, deleteProject, fetchNote, fetchNotes, fetchProjects, updateNote, updateProject } from '../../shared/api/client';
import { localDateTimeToUtcIso } from '../../entities/format';
import { fetchGithubRepositories, fetchIntegrations } from '../../shared/api/integrations';
import type { GithubIntegrationRepository } from '../../shared/api/models/integration';
import type { NoteDetail, NoteSummary } from '../../shared/api/models/note';
import type { Project } from '../../shared/api/models/project';
import { applyBackendFieldErrors, fieldNamesFromErrors, focusFirstFormError, notifyGeneralFormError } from '../../shared/forms/errors';
import { FormActions, FormField } from '../../shared/forms/fields';
import { notifySuccess } from '../../shared/ui/notifications';
import { ConfirmationModal } from '../../shared/ui/confirmation-modal';
import { discardChangesConfirmationCopy, useModalCloseGuard } from '../../shared/ui/use-modal-close-guard';
import { Pagination } from '../../shared/ui/pagination';
import { PageHead, Panel, Tags } from '../../shared/ui/primitives';
import { usePaginationState } from '../../shared/ui/use-pagination-state';
import { NoteRow } from '../../widgets/notes/NoteRow';
import { ProjectCard } from '../../widgets/projects/ProjectCard';
import { noteFormSchema, projectFormSchema, type NoteFormValues, type ProjectFormValues } from './projects-page.forms';

type ProjectModalState =
  | { mode: 'create' }
  | { mode: 'edit'; project: Project };

type NoteModalState =
  | { mode: 'create'; projectSlug: string }
  | { mode: 'edit'; note: NoteDetail };

type ConfirmState =
  | { kind: 'project'; project: Project }
  | { kind: 'note'; note: NoteSummary };

export function ProjectsPage({ dashboard, selectedProject, setSelectedProject, openNote }: PageContext) {
  const params = useParams();
  const queryClient = useQueryClient();
  const [projectModal, setProjectModal] = useState<ProjectModalState | null>(null);
  const [noteModal, setNoteModal] = useState<NoteModalState | null>(null);
  const [confirmState, setConfirmState] = useState<ConfirmState | null>(null);
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
  const notesPagination = usePaginationState(selected?.projectSlug || '');
  const notesQuery = useQuery({
    queryKey: ['notes', 'projects-page', selected?.projectSlug || '', notesPagination.page],
    queryFn: () => fetchNotes({ page: notesPagination.page, projectSlug: selected?.projectSlug || '' }),
    enabled: Boolean(selected?.projectSlug),
    initialData: dashboard.notes
      ? {
          ok: true as const,
          notes: dashboard.notes.filter((note) => note.project === (selected?.projectSlug || '')).slice(0, 10),
          pagination: {
            page: 1,
            pageSize: 10,
            total: dashboard.notes.filter((note) => note.project === (selected?.projectSlug || '')).length,
            totalPages: Math.max(1, Math.ceil(dashboard.notes.filter((note) => note.project === (selected?.projectSlug || '')).length / 10)),
            hasNext: dashboard.notes.filter((note) => note.project === (selected?.projectSlug || '')).length > 10,
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
        <Panel className="spaced">
          <div className="page-head">
            <div>
              <h2>{selected.displayName}</h2>
              <div className="card-repos">
                {selected.repositories.map((repo) => (
                  <span key={repo.externalId} className="repo-tag">
                    {repo.fullName}
                  </span>
                ))}
              </div>
            </div>
            <div className="project-actions">
              <Tags items={selected.defaultTags} />
              <button className="icon-button" type="button" onClick={() => setNoteModal({ mode: 'create', projectSlug: selected.projectSlug })}>Nova nota</button>
            </div>
          </div>
          <div className="timeline">
            {notes.map((note) => (
              <div className="timeline-item" key={note.id}>
                <NoteRow
                  dashboard={dashboard}
                  note={note}
                  onDelete={canManageNote(note) ? (item) => setConfirmState({ kind: 'note', note: item }) : undefined}
                  onEdit={canManageNote(note) ? (item) => loadNoteMutation.mutate(item.id) : undefined}
                  onOpen={openNote}
                />
              </div>
            ))}
          </div>
          {notesQuery.data ? <Pagination pagination={notesQuery.data.pagination} onPageChange={notesPagination.setPage} /> : null}
        </Panel>
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
      {noteModal ? (
        <NoteModal
          mode={noteModal.mode}
          note={noteModal.mode === 'edit' ? noteModal.note : undefined}
          onClose={() => setNoteModal(null)}
          onSaved={async (noteId, mode) => {
            setNoteModal(null);
            notifySuccess(mode === 'create' ? 'Nota criada com sucesso.' : 'Nota atualizada com sucesso.');
            await refreshDashboard(queryClient);
            if (noteId) openNote(noteId);
          }}
          projectSlug={noteModal.mode === 'edit' ? noteModal.note.project : noteModal.projectSlug}
        />
      ) : null}
      {confirmState ? (
        <ConfirmationModal
          busy={deleteProjectMutation.isPending || deleteNoteMutation.isPending}
          cancelLabel="Cancelar"
          confirmLabel="Confirmar exclusão"
          description={confirmState.kind === 'project'
            ? `A exclusao do projeto ${confirmState.project.displayName} e definitiva.`
            : `A exclusao da nota ${confirmState.note.title} tambem remove o lembrete vinculado, quando existir.`}
          onCancel={() => setConfirmState(null)}
          onConfirm={() => {
            if (confirmState.kind === 'project') {
              deleteProjectMutation.mutate(confirmState.project.projectSlug);
              return;
            }
            deleteNoteMutation.mutate(confirmState.note.id);
          }}
          title={confirmState.kind === 'project' ? 'Excluir projeto' : 'Excluir nota'}
        />
      ) : null}
    </>
  );
}

function canManageNote(note: NoteSummary) {
  return note.type === 'event' && note.source === 'manual-api';
}

async function refreshDashboard(queryClient: ReturnType<typeof useQueryClient>) {
  await queryClient.invalidateQueries({ queryKey: ['dashboard'] });
  await queryClient.invalidateQueries({ queryKey: ['projects'] });
  await queryClient.invalidateQueries({ queryKey: ['notes'] });
}

function parseList(value: string): string[] {
  return [...new Set(value.split(',').map((item) => item.trim()).filter(Boolean))];
}

function ProjectModal({
  githubConnected,
  workspaceRepositories,
  mode,
  project,
  onClose,
  onSaved,
}: {
  githubConnected: boolean;
  workspaceRepositories: GithubIntegrationRepository[];
  mode: 'create' | 'edit';
  project?: Project;
  onClose: () => void;
  onSaved: (projectSlug: string, mode: 'create' | 'edit') => void | Promise<void>;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const {
    formState: { errors, isDirty },
    handleSubmit,
    register,
    setError,
  } = useForm<ProjectFormValues>({
    resolver: zodResolver(projectFormSchema),
    shouldFocusError: false,
    defaultValues: {
      displayName: project?.displayName || '',
      projectSlug: project?.projectSlug || '',
      repositoryIds: project?.repositories.map((r) => r.externalId) || [],
      aliases: project?.aliases.join(', ') || '',
      defaultTags: project?.defaultTags.join(', ') || '',
    },
  });
  const mutation = useMutation({
    mutationFn: (values: ProjectFormValues) => {
      const payload = {
        displayName: values.displayName,
        repositoryIds: values.repositoryIds,
        aliases: parseList(values.aliases),
        defaultTags: parseList(values.defaultTags),
      };
      return mode === 'create'
        ? createProject({ ...payload, projectSlug: values.projectSlug || undefined })
        : updateProject(project?.projectSlug || '', payload);
    },
    onSuccess: async (result) => {
      closeGuard.resetCloseGuard();
      await onSaved(result.project.projectSlug, mode);
    },
    onError: (error) => {
      const fieldNames = applyBackendFieldErrors<ProjectFormValues>(error, setError);
      if (fieldNames.length > 0) {
        window.requestAnimationFrame(() => focusFirstFormError(formRef.current, fieldNames));
        return;
      }
      notifyGeneralFormError(error, mode === 'create' ? 'Nao foi possivel criar o projeto.' : 'Nao foi possivel atualizar o projeto.');
    },
  });
  const closeGuard = useModalCloseGuard({ isDirty, onClose });
  const hasRepositoryOptions = workspaceRepositories.length > 0;
  const repositoryHint = 'Selecione um ou mais repositorios vinculados ao workspace.';
  const repositoryPlaceholder = !githubConnected
    ? 'Conecte o GitHub em Integrações para listar e selecionar repositórios.'
    : 'Nenhum repositorio disponivel neste workspace. Verifique a selecao em Integracoes > GitHub.';

  return (
    <>
      <div className="modal-backdrop" role="presentation" onClick={closeGuard.requestClose}>
        <section aria-labelledby="project-modal-title" aria-modal="true" className="modal-panel integration-modal" role="dialog" onClick={(event) => event.stopPropagation()}>
          <div className="modal-head">
            <div>
              <h2 id="project-modal-title">{mode === 'create' ? 'Novo projeto' : 'Editar projeto'}</h2>
              <p>Cadastre o vinculo explicito com um repositorio GitHub.</p>
            </div>
            <button aria-label="Fechar detalhes" className="modal-close" type="button" onClick={closeGuard.requestClose}>x</button>
          </div>
          <form
            className="auth-form"
            ref={formRef}
            noValidate
            onSubmit={handleSubmit(
              (values: ProjectFormValues) => mutation.mutate(values),
              (invalidErrors) => window.requestAnimationFrame(() => focusFirstFormError(formRef.current, fieldNamesFromErrors(invalidErrors))),
            )}
          >
            <div className="form-grid">
              <FormField name="displayName" label="Nome" error={errors.displayName?.message} required>
                {(fieldProps) => <input {...fieldProps} {...register('displayName')} />}
              </FormField>
              {mode === 'create' ? (
                <FormField name="projectSlug" label="Slug" error={errors.projectSlug?.message} optional>
                  {(fieldProps) => <input {...fieldProps} {...register('projectSlug')} />}
                </FormField>
              ) : (
                <FormField name="projectSlug" label="Slug" error={undefined} optional>
                  {(fieldProps) => <input {...fieldProps} value={project?.projectSlug || ''} disabled readOnly />}
                </FormField>
              )}
            </div>
            <FormField name="repositoryIds" label="Repositorios GitHub" error={errors.repositoryIds?.message} optional>
              {(fieldProps) => (
                hasRepositoryOptions ? (
                  <select
                    multiple
                    {...fieldProps}
                    {...register('repositoryIds')}
                    disabled={mutation.isPending || !githubConnected}
                  >
                    {workspaceRepositories.map((repo) => (
                      <option key={repo.id} value={repo.id}>{repo.fullName}</option>
                    ))}
                  </select>
                ) : (
                  <input
                    {...fieldProps}
                    value={repositoryPlaceholder}
                    disabled
                    readOnly
                  />
                )
              )}
            </FormField>
            {hasRepositoryOptions ? <p className="meta">{repositoryHint}</p> : null}
            <div className="form-grid">
              <FormField name="aliases" label="Aliases" error={errors.aliases?.message} optional>
                {(fieldProps) => <input {...fieldProps} {...register('aliases')} />}
              </FormField>
              <FormField name="defaultTags" label="Tags" error={errors.defaultTags?.message} optional>
                {(fieldProps) => <input {...fieldProps} {...register('defaultTags')} />}
              </FormField>
            </div>
            <FormActions disabled={mutation.isPending} onCancel={closeGuard.requestClose} submitLabel={mode === 'create' ? 'Criar projeto' : 'Salvar projeto'} />
          </form>
        </section>
      </div>
      {closeGuard.isDiscardConfirmationOpen ? (
        <ConfirmationModal
          cancelLabel={discardChangesConfirmationCopy.cancelLabel}
          confirmLabel={discardChangesConfirmationCopy.confirmLabel}
          description={discardChangesConfirmationCopy.description}
          onCancel={closeGuard.cancelClose}
          onConfirm={closeGuard.confirmClose}
          title={discardChangesConfirmationCopy.title}
          tone="default"
        />
      ) : null}
    </>
  );
}

function NoteModal({
  mode,
  note,
  onClose,
  onSaved,
  projectSlug,
}: {
  mode: 'create' | 'edit';
  note?: NoteDetail;
  onClose: () => void;
  onSaved: (noteId: string, mode: 'create' | 'edit') => void | Promise<void>;
  projectSlug: string;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const {
    formState: { errors, isDirty },
    handleSubmit,
    register,
    setError,
  } = useForm<NoteFormValues>({
    resolver: zodResolver(noteFormSchema),
    shouldFocusError: false,
    defaultValues: {
      title: note?.title || '',
      rawText: note?.editor?.rawText || '',
      tags: note?.tags.join(', ') || '',
      reminderDate: note?.editor?.reminderDate || '',
      reminderTime: note?.editor?.reminderTime || '',
    },
  });
  const mutation = useMutation({
    mutationFn: (values: NoteFormValues) => {
      const payload = {
        title: values.title,
        rawText: values.rawText,
        tags: parseList(values.tags),
        reminderDate: values.reminderDate,
        reminderTime: values.reminderTime,
        reminderAt: localDateTimeToUtcIso(values.reminderDate, values.reminderTime),
      };
      return mode === 'create'
        ? createNote({ ...payload, projectSlug })
        : updateNote(note?.id || '', payload);
    },
    onSuccess: async (result) => {
      closeGuard.resetCloseGuard();
      await onSaved(result.noteId, mode);
    },
    onError: (error) => {
      const fieldNames = applyBackendFieldErrors<NoteFormValues>(error, setError);
      if (fieldNames.length > 0) {
        window.requestAnimationFrame(() => focusFirstFormError(formRef.current, fieldNames));
        return;
      }
      notifyGeneralFormError(error, mode === 'create' ? 'Nao foi possivel criar a nota.' : 'Nao foi possivel atualizar a nota.');
    },
  });
  const closeGuard = useModalCloseGuard({ isDirty, onClose });

  return (
    <>
      <div className="modal-backdrop" role="presentation" onClick={closeGuard.requestClose}>
        <section aria-labelledby="note-modal-title" aria-modal="true" className="modal-panel integration-modal" role="dialog" onClick={(event) => event.stopPropagation()}>
          <div className="modal-head">
            <div>
              <h2 id="note-modal-title">{mode === 'create' ? 'Nova nota' : 'Editar nota'}</h2>
              <p>{projectSlug}</p>
            </div>
            <button aria-label="Fechar detalhes" className="modal-close" type="button" onClick={closeGuard.requestClose}>x</button>
          </div>
          <form
            className="auth-form"
            ref={formRef}
            noValidate
            onSubmit={handleSubmit(
              (values: NoteFormValues) => mutation.mutate(values),
              (invalidErrors) => window.requestAnimationFrame(() => focusFirstFormError(formRef.current, fieldNamesFromErrors(invalidErrors))),
            )}
          >
            <FormField name="title" label="Titulo" error={errors.title?.message} optional>
              {(fieldProps) => <input {...fieldProps} {...register('title')} />}
            </FormField>
            <FormField name="rawText" label="Texto" error={errors.rawText?.message} required>
              {(fieldProps) => <textarea {...fieldProps} {...register('rawText')} />}
            </FormField>
            <FormField name="tags" label="Tags" error={errors.tags?.message} optional>
              {(fieldProps) => <input {...fieldProps} {...register('tags')} />}
            </FormField>
            <div className="form-grid">
              <FormField name="reminderDate" label="Data do lembrete" error={errors.reminderDate?.message} optional>
                {(fieldProps) => <input type="date" {...fieldProps} {...register('reminderDate')} />}
              </FormField>
              <FormField name="reminderTime" label="Hora do lembrete" error={errors.reminderTime?.message} optional>
                {(fieldProps) => <input type="time" {...fieldProps} {...register('reminderTime')} />}
              </FormField>
            </div>
            <FormActions disabled={mutation.isPending} onCancel={closeGuard.requestClose} submitLabel={mode === 'create' ? 'Criar nota' : 'Salvar nota'} />
          </form>
        </section>
      </div>
      {closeGuard.isDiscardConfirmationOpen ? (
        <ConfirmationModal
          cancelLabel={discardChangesConfirmationCopy.cancelLabel}
          confirmLabel={discardChangesConfirmationCopy.confirmLabel}
          description={discardChangesConfirmationCopy.description}
          onCancel={closeGuard.cancelClose}
          onConfirm={closeGuard.confirmClose}
          title={discardChangesConfirmationCopy.title}
          tone="default"
        />
      ) : null}
    </>
  );
}
