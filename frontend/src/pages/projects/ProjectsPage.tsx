import { useMutation, useQueryClient } from '@tanstack/react-query';
import { zodResolver } from '@hookform/resolvers/zod';
import { useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { useParams } from 'react-router-dom';

import type { PageContext } from '../../app/page-context';
import { createNote, createProject, deleteNote, deleteProject, fetchNote, updateNote, updateProject } from '../../shared/api/client';
import { localDateTimeToUtcIso } from '../../entities/format';
import type { NoteDetail, NoteSummary } from '../../shared/api/models/note';
import type { Project } from '../../shared/api/models/project';
import { applyBackendFieldErrors, fieldNamesFromErrors, focusFirstFormError, notifyGeneralFormError } from '../../shared/forms/errors';
import { FormActions, FormField } from '../../shared/forms/fields';
import { notifySuccess } from '../../shared/ui/notifications';
import { ConfirmationModal } from '../../shared/ui/confirmation-modal';
import { discardChangesConfirmationCopy, useModalCloseGuard } from '../../shared/ui/use-modal-close-guard';
import { PageHead, Panel, Tags } from '../../shared/ui/primitives';
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
  const selected = dashboard.projects.find((project) => project.projectSlug === selectedSlug) || dashboard.projects[0];
  const notes = dashboard.notes.filter((note) => !selected || note.project === selected.projectSlug);
  const githubRepos = Array.from(new Set(dashboard.projects.flatMap((p) => p.repositories.map((r) => r.fullName))));
  const loadNoteMutation = useMutation({
    mutationFn: (id: string) => fetchNote(id),
    onSuccess: (note) => setNoteModal({ mode: 'edit', note }),
    onError: (error) => notifyGeneralFormError(error, 'Nao foi possivel carregar a nota para edicao.'),
  });
  const deleteProjectMutation = useMutation({
    mutationFn: (projectSlug: string) => deleteProject(projectSlug),
    onSuccess: async (_, projectSlug) => {
      const nextProjectSlug = dashboard.projects.filter((project) => project.projectSlug !== projectSlug)[0]?.projectSlug || 'inbox';
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
        subtitle="Timeline de conhecimento por repositorio e atividade recente."
        action={<button className="icon-button" type="button" onClick={() => setProjectModal({ mode: 'create' })}>Novo projeto</button>}
      />
      <section className="grid cols-3">
        {dashboard.projects.map((project) => {
          const deleteBlockedReason = project.projectSlug === 'inbox'
            ? 'Inbox nao pode ser alterado.'
            : dashboard.notes.some((note) => note.project === project.projectSlug)
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
        </Panel>
      ) : null}
      {projectModal ? (
        <ProjectModal
          githubRepos={githubRepos}
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
}

function parseList(value: string): string[] {
  return [...new Set(value.split(',').map((item) => item.trim()).filter(Boolean))];
}

function ProjectModal({
  githubRepos,
  mode,
  project,
  onClose,
  onSaved,
}: {
  githubRepos: string[];
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
      repositories: project?.repositories.map((r) => r.fullName).join(', ') || '',
      aliases: project?.aliases.join(', ') || '',
      defaultTags: project?.defaultTags.join(', ') || '',
    },
  });
  const mutation = useMutation({
    mutationFn: (values: ProjectFormValues) => {
      const payload = {
        displayName: values.displayName,
        repositories: parseList(values.repositories).map((name) => ({ id: '0', fullName: name })),
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
              (values) => mutation.mutate(values),
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
            <FormField name="repositories" label="Repositorios GitHub" error={errors.repositories?.message} optional>
              {(fieldProps) => <input list="project-github-repos" {...fieldProps} {...register('repositories')} />}
            </FormField>
            <datalist id="project-github-repos">
              {githubRepos.map((repo) => (
                <option key={repo} value={repo} />
              ))}
            </datalist>
            <div className="form-grid">
              <FormField name="aliases" label="Aliases" error={errors.aliases?.message} optional>
                {(fieldProps) => <input {...fieldProps} {...register('aliases')} />}
              </FormField>
              <FormField name="defaultTags" label="Tags padrao" error={errors.defaultTags?.message} optional>
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
              (values) => mutation.mutate(values),
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
