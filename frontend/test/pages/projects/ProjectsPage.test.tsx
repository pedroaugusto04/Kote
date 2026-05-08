import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { renderWithAppProviders } from '../../../src/app/test-utils';
import { ProjectsPage } from '../../../src/pages/projects/ProjectsPage';
import type { Dashboard } from '../../../src/shared/api/models/dashboard';
import { localDateTimeToUtcIso } from '../../../src/entities/format';

function githubIntegrationsResponse(status: 'connected' | 'missing' = 'connected') {
  return {
    ok: true,
    workspaceSlug: 'default',
    integrations: [
      {
        provider: 'github-app',
        name: 'GitHub App',
        description: 'Dados de instalacao do GitHub App.',
        status,
        workspaceSlug: 'default',
        publicMetadata: {},
        primaryAction: { type: status === 'connected' ? 'revoke' : 'connect', label: status === 'connected' ? 'Revogar' : 'Conectar GitHub' },
        steps: [],
        lastError: null,
        connectedAccount: status === 'connected' ? 'acme' : null,
        updatedAt: null,
        revokedAt: null,
      },
    ],
  };
}

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
  workspaces: [{ workspaceSlug: 'default', displayName: 'Default' }],
  projects: [
    {
      projectSlug: 'inbox',
      displayName: 'Inbox',
      repositories: [],
      workspaceSlug: 'default',
      aliases: [],
      defaultTags: [],
      enabled: true,
    },
    {
      projectSlug: 'platform',
      displayName: 'Platform',
      repositories: [{ id: '1', workspaceSlug: 'default', externalId: '0', fullName: 'acme/api', htmlUrl: null, description: null, defaultBranch: null, createdAt: '', updatedAt: '' }],
      workspaceSlug: 'default',
      aliases: ['api'],
      defaultTags: ['backend'],
      enabled: true,
    },
    {
      projectSlug: 'empty',
      displayName: 'Empty',
      repositories: [{ id: '2', workspaceSlug: 'default', externalId: '0', fullName: 'acme/empty', htmlUrl: null, description: null, defaultBranch: null, createdAt: '', updatedAt: '' }],
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

function renderProjects(options?: { selectedProject?: string; route?: string }) {
  const openProject = vi.fn();
  const openNote = vi.fn();
  const selectedProject = options?.selectedProject || 'platform';
  renderWithAppProviders(
    <ProjectsPage
      dashboard={dashboard}
      selectedProject={selectedProject}
      openProject={openProject}
      openNote={openNote}
    />,
    { route: options?.route || `/projects/${selectedProject}` },
  );
  return { openProject, openNote };
}

describe('ProjectsPage', () => {
  it('closes the new project modal immediately when nothing changed', () => {
    renderProjects();

    fireEvent.click(screen.getByRole('button', { name: 'Novo projeto' }));
    const modal = screen.getByRole('dialog', { name: 'Novo projeto' });

    fireEvent.click(within(modal).getByRole('button', { name: 'Cancelar' }));

    expect(screen.queryByRole('dialog', { name: 'Novo projeto' })).not.toBeInTheDocument();
    expect(screen.queryByRole('dialog', { name: 'Descartar alterações?' })).not.toBeInTheDocument();
  });

  it('asks for confirmation before discarding project changes and closes after confirmation', () => {
    renderProjects();

    fireEvent.click(screen.getByRole('button', { name: 'Novo projeto' }));
    const modal = screen.getByRole('dialog', { name: 'Novo projeto' });
    fireEvent.change(within(modal).getByLabelText('Nome'), { target: { value: 'Billing API' } });

    fireEvent.click(within(modal).getByRole('button', { name: 'Fechar detalhes' }));

    expect(screen.getByRole('dialog', { name: 'Descartar alterações?' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Fechar sem salvar' }));

    expect(screen.queryByRole('dialog', { name: 'Novo projeto' })).not.toBeInTheDocument();
  });

  it('keeps project modal values when discard is canceled', () => {
    renderProjects();

    fireEvent.click(screen.getByRole('button', { name: 'Novo projeto' }));
    const modal = screen.getByRole('dialog', { name: 'Novo projeto' });
    const nameInput = within(modal).getByLabelText('Nome');
    fireEvent.change(nameInput, { target: { value: 'Billing API' } });

    fireEvent.click(screen.getByRole('presentation'));

    expect(screen.getByRole('dialog', { name: 'Descartar alterações?' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Continuar editando' }));

    expect(screen.getByRole('dialog', { name: 'Novo projeto' })).toBeInTheDocument();
    expect(screen.getByDisplayValue('Billing API')).toBeInTheDocument();
  });

  it('closes the new note modal immediately when nothing changed', () => {
    renderProjects();

    fireEvent.click(screen.getByRole('button', { name: 'Nova nota' }));
    const modal = screen.getByRole('dialog', { name: 'Nova nota' });

    fireEvent.click(within(modal).getByRole('button', { name: 'Cancelar' }));

    expect(screen.queryByRole('dialog', { name: 'Nova nota' })).not.toBeInTheDocument();
    expect(screen.queryByRole('dialog', { name: 'Descartar alterações?' })).not.toBeInTheDocument();
  });

  it('asks for confirmation before discarding note changes and closes after confirmation', () => {
    renderProjects();

    fireEvent.click(screen.getByRole('button', { name: 'Nova nota' }));
    const modal = screen.getByRole('dialog', { name: 'Nova nota' });
    fireEvent.change(within(modal).getByLabelText('Texto'), { target: { value: 'confirmar deploy' } });

    fireEvent.click(within(modal).getByRole('button', { name: 'Fechar detalhes' }));

    expect(screen.getByRole('dialog', { name: 'Descartar alterações?' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Fechar sem salvar' }));

    expect(screen.queryByRole('dialog', { name: 'Nova nota' })).not.toBeInTheDocument();
  });

  it('keeps note modal values when discard is canceled', () => {
    renderProjects();

    fireEvent.click(screen.getByRole('button', { name: 'Nova nota' }));
    const modal = screen.getByRole('dialog', { name: 'Nova nota' });
    fireEvent.change(within(modal).getByLabelText('Texto'), { target: { value: 'confirmar deploy' } });

    fireEvent.click(screen.getByRole('presentation'));

    expect(screen.getByRole('dialog', { name: 'Descartar alterações?' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Continuar editando' }));

    expect(screen.getByRole('dialog', { name: 'Nova nota' })).toBeInTheDocument();
    expect(screen.getByDisplayValue('confirmar deploy')).toBeInTheDocument();
  });

  it('shows frontend validation inline and focuses the first invalid project field', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      if (String(input) === '/api/integrations?workspaceSlug=default') return Response.json(githubIntegrationsResponse());
      if (String(input) === '/api/integrations/github-app/repositories?workspaceSlug=default') return Response.json({ ok: true, workspaceSlug: 'default', repositories: [] });
      return Response.error();
    });
    vi.stubGlobal('fetch', fetchMock);
    renderProjects();

    fireEvent.click(screen.getByRole('button', { name: 'Novo projeto' }));
    fireEvent.click(screen.getByRole('button', { name: 'Criar projeto' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Informe o nome do projeto.');
    await waitFor(() => expect(screen.getByLabelText('Nome')).toHaveFocus());
    expect(fetchMock).not.toHaveBeenCalledWith('/api/projects', expect.anything());
  });

  it('opens the project modal and creates a project with an explicit GitHub repository', async () => {
    const repoId = '11111111-1111-1111-1111-111111111111';
    const fetchMock = vi.fn(async (input: string, init?: RequestInit) => {
      if (input === '/api/integrations?workspaceSlug=default') return Response.json(githubIntegrationsResponse());
      if (input === '/api/integrations/github-app/repositories?workspaceSlug=default') {
        return Response.json({
          ok: true,
          workspaceSlug: 'default',
          repositories: [
            { id: repoId, fullName: 'acme/api', name: 'api', owner: 'acme', private: true, htmlUrl: 'https://github.com/acme/api', description: null, defaultBranch: 'main', selected: false },
          ]
        });
      }
      if (input === '/api/projects' && init?.method === 'POST') {
        return Response.json({
          ok: true,
          project: { ...dashboard.projects[1], projectSlug: 'billing-api', displayName: 'Billing API', repositories: [{ id: repoId, workspaceSlug: 'default', externalId: '101', fullName: 'acme/api', htmlUrl: null, description: null, defaultBranch: null, createdAt: '', updatedAt: '' }] },
          workspace: { ...dashboard.workspaces[0], projectSlugs: ['inbox', 'platform', 'empty', 'billing-api'] },
        });
      }
      return Response.error();
    });
    vi.stubGlobal('fetch', fetchMock);
    const { openProject } = renderProjects();

    fireEvent.click(screen.getByRole('button', { name: 'Novo projeto' }));
    const repositoryCheckbox = await screen.findByRole('checkbox', { name: 'acme/api Privado' });
    expect(repositoryCheckbox).not.toBeChecked();
    fireEvent.change(screen.getByLabelText('Nome'), { target: { value: 'Billing API' } });
    fireEvent.click(repositoryCheckbox);
    fireEvent.change(screen.getByLabelText('Aliases'), { target: { value: 'billing' } });
    fireEvent.change(screen.getByLabelText('Tags'), { target: { value: 'finance' } });
    fireEvent.click(screen.getByRole('button', { name: 'Criar projeto' }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/projects', expect.objectContaining({ method: 'POST' })));
    expect(notificationSpies.notifySuccess).toHaveBeenCalledWith('Projeto criado com sucesso.');
    expect(openProject).toHaveBeenCalledWith('billing-api');
  });

  it('shows a GitHub connection hint when repositories are unavailable because the integration is not connected', async () => {
    const fetchMock = vi.fn(async (input: string) => {
      if (input === '/api/integrations?workspaceSlug=default') return Response.json(githubIntegrationsResponse('missing'));
      return Response.error();
    });
    vi.stubGlobal('fetch', fetchMock);
    renderProjects();

    fireEvent.click(screen.getByRole('button', { name: 'Novo projeto' }));

    const repositoryInput = await screen.findByDisplayValue('Conecte o GitHub em Integrações para listar e selecionar repositórios.');
    expect(repositoryInput).toBeDisabled();
    expect(screen.getByText('Repositorios GitHub')).toBeInTheDocument();
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
  });

  it('creates a note with reminder fields and opens the created note', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input) === '/api/integrations?workspaceSlug=default') return Response.json(githubIntegrationsResponse());
      if (String(input) === '/api/integrations/github-app/repositories?workspaceSlug=default') return Response.json({ ok: true, workspaceSlug: 'default', repositories: [] });
      expect(String(input)).toBe('/api/notes');
      expect(JSON.parse(String(init?.body))).toMatchObject({
        projectSlug: 'platform',
        title: 'Revisar rollout',
        rawText: 'confirmar deploy',
        tags: ['deploy'],
        reminderDate: '2026-04-29',
        reminderTime: '09:30',
        reminderAt: localDateTimeToUtcIso('2026-04-29', '09:30'),
      });
      return Response.json({ ok: true, project: 'platform', noteId: 'note-2', eventPath: 'path.md' });
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

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/notes', expect.objectContaining({ method: 'POST' })));
    expect(notificationSpies.notifySuccess).toHaveBeenCalledWith('Nota criada com sucesso.');
    expect(openNote).toHaveBeenCalledWith('note-2');
  });

  it('loads note editor data and prefills the edit modal without opening the note row', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      if (String(input) === '/api/integrations?workspaceSlug=default') return Response.json(githubIntegrationsResponse());
      if (String(input) === '/api/integrations/github-app/repositories?workspaceSlug=default') return Response.json({ ok: true, workspaceSlug: 'default', repositories: [] });
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

  it('updates a note without opening it after save', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input) === '/api/integrations?workspaceSlug=default') return Response.json(githubIntegrationsResponse());
      if (String(input) === '/api/integrations/github-app/repositories?workspaceSlug=default') return Response.json({ ok: true, workspaceSlug: 'default', repositories: [] });
      if (String(input) === '/api/notes/note-1' && !init?.method) {
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
      }
      if (String(input) === '/api/notes/note-1' && init?.method === 'PATCH') {
        expect(JSON.parse(String(init.body))).toMatchObject({
          title: 'Deploy revisado',
          rawText: 'confirmar deploy atualizado',
          reminderDate: '2026-04-29',
          reminderTime: '09:30',
          reminderAt: localDateTimeToUtcIso('2026-04-29', '09:30'),
        });
        return Response.json({ ok: true, noteId: 'note-1' });
      }
      return Response.error();
    });
    vi.stubGlobal('fetch', fetchMock);
    const { openNote } = renderProjects();

    fireEvent.click(screen.getByRole('button', { name: 'Editar nota Deploy antigo' }));

    expect(await screen.findByRole('dialog', { name: 'Editar nota' })).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Titulo'), { target: { value: 'Deploy revisado' } });
    fireEvent.change(screen.getByLabelText('Texto'), { target: { value: 'confirmar deploy atualizado' } });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar nota' }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/notes/note-1', expect.objectContaining({ method: 'PATCH' })));
    expect(notificationSpies.notifySuccess).toHaveBeenCalledWith('Nota atualizada com sucesso.');
    expect(openNote).not.toHaveBeenCalled();
  });

  it('opens the folder modal from root with Raiz as the default parent', async () => {
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === '/api/integrations?workspaceSlug=default') return Response.json(githubIntegrationsResponse());
      if (url === '/api/integrations/github-app/repositories?workspaceSlug=default') return Response.json({ ok: true, workspaceSlug: 'default', repositories: [] });
      if (url === '/api/projects/platform/folders') {
        return Response.json({
          ok: true,
          projectSlug: 'platform',
          folders: [
            {
              id: 'folder-1',
              projectSlug: 'platform',
              workspaceSlug: 'default',
              parentFolderId: null,
              displayName: 'Specs',
              folderSlug: 'specs',
              fullSlugPath: 'specs',
              children: [],
            },
          ],
        });
      }
      if (url.startsWith('/api/notes?')) {
        return Response.json({
          ok: true,
          notes: [],
          pagination: { page: 1, pageSize: 5, total: 0, totalPages: 1, hasNext: false, hasPrevious: false },
        });
      }
      return Response.error();
    }));
    renderProjects();

    fireEvent.click(await screen.findByRole('button', { name: 'Nova pasta' }));

    const modal = await screen.findByRole('dialog', { name: 'Nova pasta' });
    expect(within(modal).getByLabelText('Pasta pai')).toHaveValue('');
  });

  it('uses the selected folder as the default parent and exposes folder actions in a secondary menu', async () => {
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === '/api/integrations?workspaceSlug=default') return Response.json(githubIntegrationsResponse());
      if (url === '/api/integrations/github-app/repositories?workspaceSlug=default') return Response.json({ ok: true, workspaceSlug: 'default', repositories: [] });
      if (url === '/api/projects/platform/folders') {
        return Response.json({
          ok: true,
          projectSlug: 'platform',
          folders: [
            {
              id: 'folder-1',
              projectSlug: 'platform',
              workspaceSlug: 'default',
              parentFolderId: null,
              displayName: 'Specs',
              folderSlug: 'specs',
              fullSlugPath: 'specs',
              children: [],
            },
          ],
        });
      }
      if (url.startsWith('/api/notes?')) {
        return Response.json({
          ok: true,
          notes: [],
          pagination: { page: 1, pageSize: 5, total: 0, totalPages: 1, hasNext: false, hasPrevious: false },
        });
      }
      return Response.error();
    }));
    renderProjects();

    fireEvent.click(await screen.findByRole('button', { name: 'Specs' }));

    expect(screen.queryByRole('button', { name: 'Nova subpasta' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Nova pasta' }));

    const createModal = await screen.findByRole('dialog', { name: 'Nova pasta' });
    expect(within(createModal).getByLabelText('Pasta pai')).toHaveValue('folder-1');
    fireEvent.click(within(createModal).getByRole('button', { name: 'Cancelar' }));

    fireEvent.click(screen.getByRole('button', { name: 'Editar pasta Specs' }));

    expect(await screen.findByRole('dialog', { name: 'Editar pasta' })).toBeInTheDocument();
    expect(screen.getByDisplayValue('Specs')).toBeInTheDocument();
  });

  it('updates a project and keeps the selected slug', async () => {
    const repoId = '22222222-2222-2222-2222-222222222222';
    const fetchMock = vi.fn(async (input: string, init?: RequestInit) => {
      if (input === '/api/integrations?workspaceSlug=default') return Response.json(githubIntegrationsResponse());
      if (input === '/api/integrations/github-app/repositories?workspaceSlug=default') {
        return Response.json({
          ok: true,
          workspaceSlug: 'default',
          repositories: [
            { id: repoId, fullName: 'acme/platform', name: 'platform', owner: 'acme', private: true, htmlUrl: 'https://github.com/acme/platform', description: null, defaultBranch: 'main', selected: false },
          ]
        });
      }
      if (input.includes('/api/projects/platform') && init?.method === 'PATCH') {
        return Response.json({
          ok: true,
          project: { ...dashboard.projects[1], displayName: 'Platform Core', repositories: [{ id: repoId, workspaceSlug: 'default', externalId: '102', fullName: 'acme/platform', htmlUrl: null, description: null, defaultBranch: null, createdAt: '', updatedAt: '' }], aliases: ['core'] },
        });
      }
      return Response.error();
    });
    vi.stubGlobal('fetch', fetchMock);
    const { openProject } = renderProjects();

    fireEvent.click(screen.getByRole('button', { name: 'Editar projeto Platform' }));
    const repositoryCheckbox = await screen.findByRole('checkbox', { name: 'acme/platform Privado' });
    fireEvent.change(screen.getByLabelText('Nome'), { target: { value: 'Platform Core' } });
    fireEvent.click(repositoryCheckbox);
    fireEvent.change(screen.getByLabelText('Aliases'), { target: { value: 'core' } });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar projeto' }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/projects/platform', expect.objectContaining({ method: 'PATCH' })));
    expect(notificationSpies.notifySuccess).toHaveBeenCalledWith('Projeto atualizado com sucesso.');
    expect(openProject).toHaveBeenCalledWith('platform');
  });

  it('deletes a note after confirmation and refreshes the dashboard', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input) === '/api/integrations?workspaceSlug=default') return Response.json(githubIntegrationsResponse());
      if (String(input) === '/api/integrations/github-app/repositories?workspaceSlug=default') return Response.json({ ok: true, workspaceSlug: 'default', repositories: [] });
      expect(String(input)).toBe('/api/notes/note-1');
      expect(init?.method).toBe('DELETE');
      return Response.json({ ok: true, noteId: 'note-1' });
    });
    vi.stubGlobal('fetch', fetchMock);
    renderProjects();

    fireEvent.click(screen.getByRole('button', { name: 'Excluir nota Deploy antigo' }));
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar exclusão' }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/notes/note-1', expect.objectContaining({ method: 'DELETE' })));
    expect(notificationSpies.notifySuccess).toHaveBeenCalledWith('Nota excluida com sucesso.');
  });

  it('blocks project deletion for inbox and projects with notes', () => {
    renderProjects({ selectedProject: 'inbox' });

    expect(screen.queryByRole('button', { name: 'Editar projeto Inbox' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Inbox nao pode ser alterado.' })).toBeDisabled();

    cleanup();
    renderProjects({ selectedProject: 'platform' });

    expect(screen.getByRole('button', { name: 'Exclua ou mova as notas do projeto antes de remover.' })).toBeDisabled();
  });

  it('shows only the focused project workspace without requesting the paginated project list', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === '/api/integrations?workspaceSlug=default') return Response.json(githubIntegrationsResponse());
      if (url === '/api/integrations/github-app/repositories?workspaceSlug=default') return Response.json({ ok: true, workspaceSlug: 'default', repositories: [] });
      throw new Error(`unexpected fetch ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    renderProjects();

    expect(await screen.findByRole('heading', { name: 'Platform' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Inbox' })).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Empty' })).not.toBeInTheDocument();
    expect(fetchMock.mock.calls.some(([input]) => String(input).startsWith('/api/projects?'))).toBe(false);
  });

  it('deletes an empty project after confirmation and redirects selection', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input) === '/api/integrations?workspaceSlug=default') return Response.json(githubIntegrationsResponse());
      if (String(input) === '/api/integrations/github-app/repositories?workspaceSlug=default') return Response.json({ ok: true, workspaceSlug: 'default', repositories: [] });
      expect(String(input)).toBe('/api/projects/empty');
      expect(init?.method).toBe('DELETE');
      return Response.json({ ok: true, projectSlug: 'empty' });
    });
    vi.stubGlobal('fetch', fetchMock);
    const { openProject } = renderProjects({ selectedProject: 'empty' });

    fireEvent.click(screen.getByRole('button', { name: 'Excluir projeto Empty' }));
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar exclusão' }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/projects/empty', expect.objectContaining({ method: 'DELETE' })));
    expect(notificationSpies.notifySuccess).toHaveBeenCalledWith('Projeto excluido com sucesso.');
    expect(openProject).toHaveBeenCalledWith('inbox');
  });

  it('shows backend field errors inline when project creation fails', async () => {
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      if (String(input) === '/api/integrations?workspaceSlug=default') return Response.json(githubIntegrationsResponse());
      if (String(input) === '/api/integrations/github-app/repositories?workspaceSlug=default') return Response.json({ ok: true, workspaceSlug: 'default', repositories: [] });
      return Response.json({
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
      });
    }));
    renderProjects();

    fireEvent.click(screen.getByRole('button', { name: 'Novo projeto' }));
    fireEvent.change(screen.getByLabelText('Nome'), { target: { value: 'Billing API' } });
    fireEvent.change(screen.getByLabelText('Slug'), { target: { value: 'platform' } });
    fireEvent.click(screen.getByRole('button', { name: 'Criar projeto' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Este slug de projeto ja existe.');
    await waitFor(() => expect(screen.getByLabelText('Slug')).toHaveFocus());
  });

  it('shows backend field errors inline when note creation fails', async () => {
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      if (String(input) === '/api/integrations?workspaceSlug=default') return Response.json(githubIntegrationsResponse());
      if (String(input) === '/api/integrations/github-app/repositories?workspaceSlug=default') return Response.json({ ok: true, workspaceSlug: 'default', repositories: [] });
      return Response.json({
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
      });
    }));
    renderProjects();

    fireEvent.click(screen.getByRole('button', { name: 'Nova nota' }));
    fireEvent.change(screen.getByLabelText('Texto'), { target: { value: 'confirmar deploy' } });
    fireEvent.click(screen.getByRole('button', { name: 'Criar nota' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Informe o texto da nota.');
    await waitFor(() => expect(screen.getByLabelText('Texto')).toHaveFocus());
  });
});
