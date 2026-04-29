import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { renderWithAppProviders } from '../../../src/app/test-utils';
import { ProjectsPage } from '../../../src/pages/projects/ProjectsPage';
import type { Dashboard } from '../../../src/shared/api/models/dashboard';

const notificationSpies = vi.hoisted(() => ({
  notifySuccess: vi.fn(),
  notifyError: vi.fn(),
  notifyInfo: vi.fn(),
  notifyWarning: vi.fn(),
}));

vi.mock('../../../src/shared/ui/notifications', () => ({
  NotificationsProvider: () => null,
  ...notificationSpies,
}));

const dashboard: Dashboard = {
  workspaces: [{ workspaceSlug: 'default', displayName: 'Default', githubRepos: ['acme/api'], projectSlugs: ['inbox', 'platform'] }],
  projects: [
    {
      projectSlug: 'inbox',
      displayName: 'Inbox',
      repoFullName: '',
      workspaceSlug: 'default',
      aliases: [],
      defaultTags: [],
      enabled: true,
    },
    {
      projectSlug: 'platform',
      displayName: 'Platform',
      repoFullName: 'acme/api',
      workspaceSlug: 'default',
      aliases: ['api'],
      defaultTags: ['backend'],
      enabled: true,
    },
    {
      projectSlug: 'empty',
      displayName: 'Empty',
      repoFullName: 'acme/empty',
      workspaceSlug: 'default',
      aliases: [],
      defaultTags: [],
      enabled: true,
    },
  ],
  notes: [
    {
      id: 'note-1',
      path: '20 Inbox/platform/note.md',
      type: 'event',
      title: 'Deploy antigo',
      project: 'platform',
      workspace: 'default',
      tags: ['deploy'],
      date: '2026-04-27',
      status: 'active',
      summary: 'Resumo',
      source: 'manual-api',
    },
  ],
  reviews: [],
  reminders: [],
  home: {
    windowDays: 7,
    metrics: [],
    activityByDay: [],
    activityByProject: [],
    priorities: [],
    recentInterestingEvents: [],
  },
};

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

function renderProjects() {
  const setSelectedProject = vi.fn();
  const openNote = vi.fn();
  renderWithAppProviders(
    <ProjectsPage
      dashboard={dashboard}
      selectedProject="platform"
      selectedNoteId=""
      selectedReviewId=""
      setSelectedProject={setSelectedProject}
      openNote={openNote}
      openReview={vi.fn()}
    />,
    { route: '/projects/platform' },
  );
  return { setSelectedProject, openNote };
}

describe('ProjectsPage', () => {
  it('shows frontend validation inline and focuses the first invalid project field', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    renderProjects();

    fireEvent.click(screen.getByRole('button', { name: 'Novo projeto' }));
    fireEvent.click(screen.getByRole('button', { name: 'Criar projeto' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Informe o nome do projeto.');
    await waitFor(() => expect(screen.getByLabelText('Nome')).toHaveFocus());
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('opens the project modal and creates a project with an explicit GitHub repository', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      expect(String(input)).toBe('/api/projects');
      expect(JSON.parse(String(init?.body))).toMatchObject({
        displayName: 'Billing API',
        repoFullName: 'acme/api',
        aliases: ['billing'],
        defaultTags: ['finance'],
      });
      return Response.json({
        ok: true,
        project: { ...dashboard.projects[1], projectSlug: 'billing-api', displayName: 'Billing API', repoFullName: 'acme/api' },
        workspace: { ...dashboard.workspaces[0], projectSlugs: ['inbox', 'platform', 'empty', 'billing-api'] },
      });
    });
    vi.stubGlobal('fetch', fetchMock);
    const { setSelectedProject } = renderProjects();

    fireEvent.click(screen.getByRole('button', { name: 'Novo projeto' }));
    fireEvent.change(screen.getByLabelText('Nome'), { target: { value: 'Billing API' } });
    fireEvent.change(screen.getByLabelText('Repositorio GitHub'), { target: { value: 'acme/api' } });
    fireEvent.change(screen.getByLabelText('Aliases'), { target: { value: 'billing' } });
    fireEvent.change(screen.getByLabelText('Tags padrao'), { target: { value: 'finance' } });
    fireEvent.click(screen.getByRole('button', { name: 'Criar projeto' }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(notificationSpies.notifySuccess).toHaveBeenCalledWith('Projeto criado com sucesso.');
    expect(setSelectedProject).toHaveBeenCalledWith('billing-api');
  });

  it('creates a note with reminder fields and opens the created note', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      expect(String(input)).toBe('/api/notes');
      expect(JSON.parse(String(init?.body))).toMatchObject({
        projectSlug: 'platform',
        title: 'Revisar rollout',
        rawText: 'confirmar deploy',
        tags: ['deploy'],
        reminderDate: '2026-04-29',
        reminderTime: '09:30',
      });
      return Response.json({ ok: true, project: 'platform', noteId: 'note-2', reminderNoteId: 'reminder-1', eventPath: 'path.md' });
    });
    vi.stubGlobal('fetch', fetchMock);
    const { openNote } = renderProjects();

    fireEvent.click(screen.getByRole('button', { name: 'Nova nota' }));
    fireEvent.change(screen.getByLabelText('Titulo'), { target: { value: 'Revisar rollout' } });
    fireEvent.change(screen.getByLabelText('Texto'), { target: { value: 'confirmar deploy' } });
    fireEvent.change(screen.getByLabelText('Tags'), { target: { value: 'deploy' } });
    fireEvent.change(screen.getByLabelText('Data do lembrete'), { target: { value: '2026-04-29' } });
    fireEvent.change(screen.getByLabelText('Hora do lembrete'), { target: { value: '09:30' } });
    fireEvent.click(screen.getByRole('button', { name: 'Criar nota' }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(notificationSpies.notifySuccess).toHaveBeenCalledWith('Nota criada com sucesso.');
    expect(openNote).toHaveBeenCalledWith('note-2');
  });

  it('loads note editor data and prefills the edit modal without opening the note row', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      expect(String(input)).toBe('/api/notes/note-1');
      return Response.json({
        ok: true,
        note: {
          ...dashboard.notes[0],
          markdown: '# Deploy antigo',
          frontmatter: {},
          links: [],
          origin: 'postgres',
          editor: {
            canDelete: true,
            rawText: 'confirmar deploy',
            reminderDate: '2026-04-29',
            reminderTime: '09:30',
          },
        },
      });
    });
    vi.stubGlobal('fetch', fetchMock);
    const { openNote } = renderProjects();

    fireEvent.click(screen.getByRole('button', { name: 'Editar nota Deploy antigo' }));

    expect(openNote).not.toHaveBeenCalled();
    expect(await screen.findByDisplayValue('confirmar deploy')).toBeInTheDocument();
    expect(screen.getByDisplayValue('2026-04-29')).toBeInTheDocument();
  });

  it('updates a project and keeps the selected slug', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      expect(String(input)).toBe('/api/projects/platform');
      expect(init?.method).toBe('PATCH');
      expect(JSON.parse(String(init?.body))).toMatchObject({
        displayName: 'Platform Core',
        repoFullName: 'acme/platform',
        aliases: ['core'],
        defaultTags: ['backend'],
      });
      return Response.json({
        ok: true,
        project: { ...dashboard.projects[1], displayName: 'Platform Core', repoFullName: 'acme/platform', aliases: ['core'] },
      });
    });
    vi.stubGlobal('fetch', fetchMock);
    const { setSelectedProject } = renderProjects();

    fireEvent.click(screen.getByRole('button', { name: 'Editar projeto Platform' }));
    fireEvent.change(screen.getByLabelText('Nome'), { target: { value: 'Platform Core' } });
    fireEvent.change(screen.getByLabelText('Repositorio GitHub'), { target: { value: 'acme/platform' } });
    fireEvent.change(screen.getByLabelText('Aliases'), { target: { value: 'core' } });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar projeto' }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(notificationSpies.notifySuccess).toHaveBeenCalledWith('Projeto atualizado com sucesso.');
    expect(setSelectedProject).toHaveBeenCalledWith('platform');
  });

  it('deletes a note after confirmation and refreshes the dashboard', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      expect(String(input)).toBe('/api/notes/note-1');
      expect(init?.method).toBe('DELETE');
      return Response.json({ ok: true, noteId: 'note-1', reminderNoteId: 'reminder-1' });
    });
    vi.stubGlobal('fetch', fetchMock);
    renderProjects();

    fireEvent.click(screen.getByRole('button', { name: 'Excluir nota Deploy antigo' }));
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar exclusão' }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(notificationSpies.notifySuccess).toHaveBeenCalledWith('Nota excluida com sucesso.');
  });

  it('blocks project deletion for inbox and projects with notes', () => {
    renderProjects();

    expect(screen.queryByRole('button', { name: 'Editar projeto Inbox' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Inbox nao pode ser alterado.' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Exclua ou mova as notas do projeto antes de remover.' })).toBeDisabled();
  });

  it('deletes an empty project after confirmation and redirects selection', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      expect(String(input)).toBe('/api/projects/empty');
      expect(init?.method).toBe('DELETE');
      return Response.json({ ok: true, projectSlug: 'empty' });
    });
    vi.stubGlobal('fetch', fetchMock);
    const { setSelectedProject } = renderProjects();

    fireEvent.click(screen.getByRole('button', { name: 'Excluir projeto Empty' }));
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar exclusão' }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(notificationSpies.notifySuccess).toHaveBeenCalledWith('Projeto excluido com sucesso.');
    expect(setSelectedProject).toHaveBeenCalledWith('inbox');
  });

  it('shows backend field errors inline when project creation fails', async () => {
    vi.stubGlobal('fetch', vi.fn(async () =>
      Response.json({
        ok: false,
        error: {
          code: 'project_slug_already_exists',
          message: 'Slug de projeto ja cadastrado.',
          details: { fieldErrors: { projectSlug: 'Este slug de projeto ja existe.' } },
        },
        requestId: 'req-project',
      }, {
        status: 409,
        headers: { 'x-request-id': 'req-project' },
      }),
    ));
    renderProjects();

    fireEvent.click(screen.getByRole('button', { name: 'Novo projeto' }));
    fireEvent.change(screen.getByLabelText('Nome'), { target: { value: 'Billing API' } });
    fireEvent.change(screen.getByLabelText('Slug'), { target: { value: 'platform' } });
    fireEvent.click(screen.getByRole('button', { name: 'Criar projeto' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Este slug de projeto ja existe.');
    await waitFor(() => expect(screen.getByLabelText('Slug')).toHaveFocus());
  });

  it('shows backend field errors inline when note creation fails', async () => {
    vi.stubGlobal('fetch', vi.fn(async () =>
      Response.json({
        ok: false,
        error: {
          code: 'invalid_create_note_payload',
          message: 'Payload de nota invalido.',
          details: { fieldErrors: { rawText: 'Informe o texto da nota.' } },
        },
        requestId: 'req-note',
      }, {
        status: 400,
        headers: { 'x-request-id': 'req-note' },
      }),
    ));
    renderProjects();

    fireEvent.click(screen.getByRole('button', { name: 'Nova nota' }));
    fireEvent.change(screen.getByLabelText('Texto'), { target: { value: 'confirmar deploy' } });
    fireEvent.click(screen.getByRole('button', { name: 'Criar nota' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Informe o texto da nota.');
    await waitFor(() => expect(screen.getByLabelText('Texto')).toHaveFocus());
  });
});
