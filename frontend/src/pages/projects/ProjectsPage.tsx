import { useMutation, useQueryClient } from '@tanstack/react-query';
import { zodResolver } from '@hookform/resolvers/zod';
import { useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { useParams } from 'react-router-dom';

import type { PageContext } from '../../app/page-context';
import { createNote, createProject } from '../../shared/api/client';
import { applyBackendFieldErrors, fieldNamesFromErrors, focusFirstFormError, notifyGeneralFormError } from '../../shared/forms/errors';
import { FormActions, FormField } from '../../shared/forms/fields';
import { notifySuccess } from '../../shared/ui/notifications';
import { PageHead, Panel, Tags } from '../../shared/ui/primitives';
import { NoteRow } from '../../widgets/notes/NoteRow';
import { ProjectCard } from '../../widgets/projects/ProjectCard';
import { noteFormSchema, projectFormSchema, type NoteFormValues, type ProjectFormValues } from './projects-page.forms';

export function ProjectsPage({ dashboard, selectedProject, setSelectedProject, openNote }: PageContext) {
  const params = useParams();
  const queryClient = useQueryClient();
  const [projectModalOpen, setProjectModalOpen] = useState(false);
  const [noteModalOpen, setNoteModalOpen] = useState(false);
  const routeProject = params.projectSlug ? decodeURIComponent(params.projectSlug) : '';
  const selectedSlug = routeProject || selectedProject;
  const selected = dashboard.projects.find((project) => project.projectSlug === selectedSlug) || dashboard.projects[0];
  const notes = dashboard.notes.filter((note) => !selected || note.project === selected.projectSlug);
  const githubRepos = dashboard.workspaces[0]?.githubRepos || [];

  function refreshDashboard() {
    return queryClient.invalidateQueries({ queryKey: ['dashboard'] });
  }

  return (
    <>
      <PageHead
        title="Projetos"
        subtitle="Timeline de conhecimento por repositorio e atividade recente."
        action={<button className="icon-button" type="button" onClick={() => setProjectModalOpen(true)}>Novo projeto</button>}
      />
      <section className="grid cols-3">
        {dashboard.projects.map((project) => (
          <ProjectCard key={project.projectSlug} project={project} onOpen={setSelectedProject} />
        ))}
      </section>
      {selected ? (
        <Panel className="spaced">
          <div className="page-head">
            <div>
              <h2>{selected.displayName}</h2>
              <p>{selected.repoFullName}</p>
            </div>
            <div className="project-actions">
              <Tags items={selected.defaultTags} />
              <button className="icon-button" type="button" onClick={() => setNoteModalOpen(true)}>Nova nota</button>
            </div>
          </div>
          <div className="timeline">
            {notes.map((note) => (
              <div className="timeline-item" key={note.id}>
                <NoteRow note={note} dashboard={dashboard} onOpen={openNote} />
              </div>
            ))}
          </div>
        </Panel>
      ) : null}
      {projectModalOpen ? (
        <ProjectModal
          githubRepos={githubRepos}
          onClose={() => setProjectModalOpen(false)}
          onCreated={(projectSlug) => {
            setProjectModalOpen(false);
            notifySuccess('Projeto criado com sucesso.');
            setSelectedProject(projectSlug);
            refreshDashboard();
          }}
        />
      ) : null}
      {noteModalOpen && selected ? (
        <NoteModal
          projectSlug={selected.projectSlug}
          onClose={() => setNoteModalOpen(false)}
          onCreated={(noteId) => {
            setNoteModalOpen(false);
            notifySuccess('Nota criada com sucesso.');
            refreshDashboard();
            if (noteId) openNote(noteId);
          }}
        />
      ) : null}
    </>
  );
}

function parseList(value: string): string[] {
  return [...new Set(value.split(',').map((item) => item.trim()).filter(Boolean))];
}

function ProjectModal({ githubRepos, onClose, onCreated }: { githubRepos: string[]; onClose: () => void; onCreated: (projectSlug: string) => void }) {
  const formRef = useRef<HTMLFormElement>(null);
  const {
    formState: { errors },
    handleSubmit,
    register,
    setError,
  } = useForm<ProjectFormValues>({
    resolver: zodResolver(projectFormSchema),
    shouldFocusError: false,
    defaultValues: { displayName: '', projectSlug: '', repoFullName: '', aliases: '', defaultTags: '' },
  });
  const mutation = useMutation({
    mutationFn: (values: ProjectFormValues) =>
      createProject({
        displayName: values.displayName,
        projectSlug: values.projectSlug || undefined,
        repoFullName: values.repoFullName || undefined,
        aliases: parseList(values.aliases),
        defaultTags: parseList(values.defaultTags),
      }),
    onSuccess: (result) => onCreated(result.project.projectSlug),
    onError: (error) => {
      const fieldNames = applyBackendFieldErrors<ProjectFormValues>(error, setError);
      if (fieldNames.length > 0) {
        window.requestAnimationFrame(() => focusFirstFormError(formRef.current, fieldNames));
        return;
      }
      notifyGeneralFormError(error, 'Nao foi possivel criar o projeto.');
    },
  });

  return (
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <section aria-labelledby="project-modal-title" aria-modal="true" className="modal-panel integration-modal" role="dialog" onClick={(event) => event.stopPropagation()}>
        <div className="modal-head">
          <div>
            <h2 id="project-modal-title">Novo projeto</h2>
            <p>Cadastre o vinculo explicito com um repositorio GitHub.</p>
          </div>
          <button aria-label="Fechar detalhes" className="modal-close" type="button" onClick={onClose}>x</button>
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
            <FormField name="displayName" label="Nome" error={errors.displayName?.message}>
              {(fieldProps) => <input {...fieldProps} {...register('displayName')} />}
            </FormField>
            <FormField name="projectSlug" label="Slug" error={errors.projectSlug?.message}>
              {(fieldProps) => <input {...fieldProps} {...register('projectSlug')} />}
            </FormField>
          </div>
          <FormField name="repoFullName" label="Repositorio GitHub" error={errors.repoFullName?.message}>
            {(fieldProps) => <input list="project-github-repos" {...fieldProps} {...register('repoFullName')} />}
          </FormField>
            <datalist id="project-github-repos">
              {githubRepos.map((repo) => (
                <option key={repo} value={repo} />
              ))}
            </datalist>
          <div className="form-grid">
            <FormField name="aliases" label="Aliases" error={errors.aliases?.message}>
              {(fieldProps) => <input {...fieldProps} {...register('aliases')} />}
            </FormField>
            <FormField name="defaultTags" label="Tags padrao" error={errors.defaultTags?.message}>
              {(fieldProps) => <input {...fieldProps} {...register('defaultTags')} />}
            </FormField>
          </div>
          <FormActions disabled={mutation.isPending} onCancel={onClose} submitLabel="Criar projeto" />
        </form>
      </section>
    </div>
  );
}

function NoteModal({ projectSlug, onClose, onCreated }: { projectSlug: string; onClose: () => void; onCreated: (noteId: string) => void }) {
  const formRef = useRef<HTMLFormElement>(null);
  const {
    formState: { errors },
    handleSubmit,
    register,
    setError,
  } = useForm<NoteFormValues>({
    resolver: zodResolver(noteFormSchema),
    shouldFocusError: false,
    defaultValues: { title: '', rawText: '', tags: '', reminderDate: '', reminderTime: '' },
  });
  const mutation = useMutation({
    mutationFn: (values: NoteFormValues) =>
      createNote({
        projectSlug,
        title: values.title,
        rawText: values.rawText,
        tags: parseList(values.tags),
        reminderDate: values.reminderDate,
        reminderTime: values.reminderTime,
      }),
    onSuccess: (result) => onCreated(result.noteId),
    onError: (error) => {
      const fieldNames = applyBackendFieldErrors<NoteFormValues>(error, setError);
      if (fieldNames.length > 0) {
        window.requestAnimationFrame(() => focusFirstFormError(formRef.current, fieldNames));
        return;
      }
      notifyGeneralFormError(error, 'Nao foi possivel criar a nota.');
    },
  });

  return (
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <section aria-labelledby="note-modal-title" aria-modal="true" className="modal-panel integration-modal" role="dialog" onClick={(event) => event.stopPropagation()}>
        <div className="modal-head">
          <div>
            <h2 id="note-modal-title">Nova nota</h2>
            <p>{projectSlug}</p>
          </div>
          <button aria-label="Fechar detalhes" className="modal-close" type="button" onClick={onClose}>x</button>
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
          <FormField name="title" label="Titulo" error={errors.title?.message}>
            {(fieldProps) => <input {...fieldProps} {...register('title')} />}
          </FormField>
          <FormField name="rawText" label="Texto" error={errors.rawText?.message}>
            {(fieldProps) => <textarea {...fieldProps} {...register('rawText')} />}
          </FormField>
          <FormField name="tags" label="Tags" error={errors.tags?.message}>
            {(fieldProps) => <input {...fieldProps} {...register('tags')} />}
          </FormField>
          <div className="form-grid">
            <FormField name="reminderDate" label="Data do lembrete" error={errors.reminderDate?.message}>
              {(fieldProps) => <input type="date" {...fieldProps} {...register('reminderDate')} />}
            </FormField>
            <FormField name="reminderTime" label="Hora do lembrete" error={errors.reminderTime?.message}>
              {(fieldProps) => <input type="time" {...fieldProps} {...register('reminderTime')} />}
            </FormField>
          </div>
          <FormActions disabled={mutation.isPending} onCancel={onClose} submitLabel="Criar nota" />
        </form>
      </section>
    </div>
  );
}
