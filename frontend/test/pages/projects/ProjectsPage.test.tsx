import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { renderWithAppProviders } from '../../../src/app/test-utils';
import { ProjectsPage } from '../../../src/pages/projects/ProjectsPage';
import type { Dashboard } from '../../../src/shared/api/models/dashboard';

function githubIntegrationsResponse(status: 'connected' | 'missing' = 'connected') {
  return {
    ok: true,
    workspaceSlug: 'default',
    integrations: [
      {
        provider: 'github-app',
        name: 'GitHub App',
        description: 'GitHub App installation data.',
        status,
        workspaceSlug: 'default',
        publicMetadata: {},
        primaryAction: { type: status === 'connected' ? 'revoke' : 'connect', label: status === 'connected' ? 'Revoke' : 'Connect GitHub' },
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
      defaultTags: [],
      enabled: true,
      favorite: false,
    },
    {
      projectSlug: 'platform',
      displayName: 'Platform',
      repositories: [{ id: '1', workspaceSlug: 'default', externalId: '0', fullName: 'acme/api', htmlUrl: null, description: null, defaultBranch: null, createdAt: '', updatedAt: '' }],
      workspaceSlug: 'default',
      defaultTags: ['backend'],
      enabled: true,
      favorite: false,
    },
    {
      projectSlug: 'empty',
      displayName: 'Empty',
      repositories: [{ id: '2', workspaceSlug: 'default', externalId: '0', fullName: 'acme/empty', htmlUrl: null, description: null, defaultBranch: null, createdAt: '', updatedAt: '' }],
      workspaceSlug: 'default',
      defaultTags: [],
      enabled: true,
      favorite: false,
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
      folderId: null,
      tags: ['deploy'],
      date: '2026-04-27',
      status: 'active',
      summary: 'Resumo',
      source: 'manual-api',
      attachmentCount: 0,
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
      editNote={vi.fn()}
      deleteNote={vi.fn()}
    />,
    { route: options?.route || `/projects/${selectedProject}` },
  );
  return { openProject, openNote };
}

function timelineFromDashboardNotes(projectSlug = 'platform') {
  const notes = (dashboard.notes || []).filter((note) => note.project === projectSlug);
  return {
    ok: true,
    timeline: notes.map((note) => ({
      ...note,
      noteId: note.id,
      category: note.type === 'decision' ? 'decision' : 'manual',
      sourceChannel: note.source,
      attachmentCount: note.attachmentCount || 0,
      folderId: note.folderId || null,
    })),
    pagination: {
      page: 1,
      pageSize: 10,
      total: notes.length,
      totalPages: 1,
      hasNext: false,
      hasPrevious: false,
    },
  };
}

function projectBriefResponse(fallback = false) {
  return {
    ok: true,
    fallback,
    fallbackReason: fallback ? 'generation_failed' : undefined,
    brief: {
      projectSlug: 'platform',
      generatedAt: '2026-05-22T12:00:00.000Z',
      summary: 'Platform is actively processing deployment work.',
      status: 'Active with one open rollout item.',
      recentChanges: ['Deployment note was captured.'],
      decisions: ['Keep the current rollout path.'],
      openItems: ['Confirm production rollout.'],
      risks: ['Release validation is still pending.'],
      nextSteps: ['Open the deployment note and close the rollout item.'],
      sources: [{ noteId: 'note-1', title: 'Deploy antigo', path: '20 Inbox/platform/note.md', date: '2026-04-27T00:00:00.000Z' }],
    },
  } as const;
}

function savedProjectBriefResponse(brief = projectBriefResponse().brief) {
  return {
    ok: true,
    source: 'history',
    brief,
  } as const;
}

describe('ProjectsPage', () => {
  it('allows selecting another project from the header select', () => {
    const { openProject } = renderProjects();

    fireEvent.click(screen.getByLabelText('Select project'));
    fireEvent.click(screen.getByRole('option', { name: 'Empty' }));

    expect(openProject).toHaveBeenCalledWith('empty');
  });

  it('closes the new project modal immediately when nothing changed', () => {
    renderProjects();

    fireEvent.click(screen.getByRole('button', { name: 'New project' }));
    const modal = screen.getByRole('dialog', { name: 'New project' });

    fireEvent.click(within(modal).getByRole('button', { name: 'Cancel' }));

    expect(screen.queryByRole('dialog', { name: 'New project' })).not.toBeInTheDocument();
    expect(screen.queryByRole('dialog', { name: 'Discard changes?' })).not.toBeInTheDocument();
  });

  it('asks for confirmation before discarding project changes and closes after confirmation', () => {
    renderProjects();

    fireEvent.click(screen.getByRole('button', { name: 'New project' }));
    const modal = screen.getByRole('dialog', { name: 'New project' });
    fireEvent.change(within(modal).getByLabelText('Name'), { target: { value: 'Billing API' } });

    fireEvent.click(within(modal).getByRole('button', { name: 'Close details' }));

    expect(screen.getByRole('dialog', { name: 'Discard changes?' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Close without saving' }));

    expect(screen.queryByRole('dialog', { name: 'New project' })).not.toBeInTheDocument();
  });

  it('keeps project modal values when discard is canceled', () => {
    renderProjects();

    fireEvent.click(screen.getByRole('button', { name: 'New project' }));
    const modal = screen.getByRole('dialog', { name: 'New project' });
    const nameInput = within(modal).getByLabelText('Name');
    fireEvent.change(nameInput, { target: { value: 'Billing API' } });

    fireEvent.click(screen.getByRole('presentation'));

    expect(screen.getByRole('dialog', { name: 'Discard changes?' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Keep editing' }));

    expect(screen.getByRole('dialog', { name: 'New project' })).toBeInTheDocument();
    expect(screen.getByDisplayValue('Billing API')).toBeInTheDocument();
  });

  it('closes the new note modal immediately when nothing changed', () => {
    renderProjects();

    fireEvent.click(screen.getByRole('button', { name: 'New note' }));
    const modal = screen.getByRole('dialog', { name: 'New note' });

    fireEvent.click(within(modal).getByRole('button', { name: 'Cancel' }));

    expect(screen.queryByRole('dialog', { name: 'New note' })).not.toBeInTheDocument();
    expect(screen.queryByRole('dialog', { name: 'Discard changes?' })).not.toBeInTheDocument();
  });

  it('asks for confirmation before discarding note changes and closes after confirmation', () => {
    renderProjects();

    fireEvent.click(screen.getByRole('button', { name: 'New note' }));
    const modal = screen.getByRole('dialog', { name: 'New note' });
    fireEvent.change(within(modal).getByLabelText('Text'), { target: { value: 'confirmar deploy' } });

    fireEvent.click(within(modal).getByRole('button', { name: 'Close details' }));

    expect(screen.getByRole('dialog', { name: 'Discard changes?' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Close without saving' }));

    expect(screen.queryByRole('dialog', { name: 'New note' })).not.toBeInTheDocument();
  });

  it('keeps note modal values when discard is canceled', () => {
    renderProjects();

    fireEvent.click(screen.getByRole('button', { name: 'New note' }));
    const modal = screen.getByRole('dialog', { name: 'New note' });
    fireEvent.change(within(modal).getByLabelText('Text'), { target: { value: 'confirmar deploy' } });

    fireEvent.click(screen.getByRole('presentation'));

    expect(screen.getByRole('dialog', { name: 'Discard changes?' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Keep editing' }));

    expect(screen.getByRole('dialog', { name: 'New note' })).toBeInTheDocument();
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

    fireEvent.click(screen.getByRole('button', { name: 'New project' }));
    fireEvent.click(screen.getByRole('button', { name: 'Create project' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Enter the project name.');
    await waitFor(() => expect(screen.getByLabelText('Name')).toHaveFocus());
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

    fireEvent.click(screen.getByRole('button', { name: 'New project' }));
    const repositoryCheckbox = await screen.findByRole('checkbox', { name: 'acme/api Private' });
    expect(repositoryCheckbox).not.toBeChecked();
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Billing API' } });
    fireEvent.click(repositoryCheckbox);
    fireEvent.change(screen.getByLabelText('Tags'), { target: { value: 'finance' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create project' }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/projects', expect.objectContaining({ method: 'POST' })));
    expect(notificationSpies.notifySuccess).toHaveBeenCalledWith('Project created successfully.');
    expect(openProject).toHaveBeenCalledWith('billing-api');
  });

  it('shows a GitHub connection hint when repositories are unavailable because the integration is not connected', async () => {
    const fetchMock = vi.fn(async (input: string) => {
      if (input === '/api/integrations?workspaceSlug=default') return Response.json(githubIntegrationsResponse('missing'));
      return Response.error();
    });
    vi.stubGlobal('fetch', fetchMock);
    renderProjects();

    fireEvent.click(screen.getByRole('button', { name: 'New project' }));

    const repositoryInput = await screen.findByDisplayValue('Connect GitHub in Integrations to list and select repositories.');
    expect(repositoryInput).toBeDisabled();
    expect(screen.getByText('GitHub repositories')).toBeInTheDocument();
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
      });
      return Response.json({ ok: true, project: 'platform', noteId: 'note-2', eventPath: 'path.md' });
    });
    vi.stubGlobal('fetch', fetchMock);
    const { openNote } = renderProjects();

    fireEvent.click(screen.getByRole('button', { name: 'New note' }));
    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'Revisar rollout' } });
    fireEvent.change(screen.getByLabelText('Text'), { target: { value: 'confirmar deploy' } });
    fireEvent.change(screen.getByLabelText('Tags'), { target: { value: 'deploy' } });
    fireEvent.change(screen.getByLabelText('Reminder date'), { target: { value: '2026-04-29' } });
    fireEvent.change(screen.getByLabelText('Reminder time'), { target: { value: '09:30' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create note' }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/notes', expect.objectContaining({ method: 'POST' })));
    expect(notificationSpies.notifySuccess).toHaveBeenCalledWith('Note created successfully.');
    expect(openNote).toHaveBeenCalledWith('note-2');
  });

  it('loads note editor data and prefills the edit modal without opening the note row', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      if (String(input) === '/api/integrations?workspaceSlug=default') return Response.json(githubIntegrationsResponse());
      if (String(input) === '/api/integrations/github-app/repositories?workspaceSlug=default') return Response.json({ ok: true, workspaceSlug: 'default', repositories: [] });
      if (String(input).startsWith('/api/projects/platform/timeline?')) return Response.json(timelineFromDashboardNotes());
      expect(String(input)).toBe('/api/notes/note-1');
      return Response.json({
        ok: true,
        note: {
          ...dashboard.notes![0],
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

    fireEvent.click(await screen.findByRole('button', { name: 'Edit note Deploy antigo' }));

    expect(openNote).not.toHaveBeenCalled();
    expect(await screen.findByDisplayValue('confirmar deploy')).toBeInTheDocument();
    expect(screen.getByDisplayValue('2026-04-29')).toBeInTheDocument();
  });

  it('updates a note without opening it after save', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input) === '/api/integrations?workspaceSlug=default') return Response.json(githubIntegrationsResponse());
      if (String(input) === '/api/integrations/github-app/repositories?workspaceSlug=default') return Response.json({ ok: true, workspaceSlug: 'default', repositories: [] });
      if (String(input).startsWith('/api/projects/platform/timeline?')) return Response.json(timelineFromDashboardNotes());
      if (String(input) === '/api/notes/note-1' && !init?.method) {
        return Response.json({
          ok: true,
          note: {
            ...dashboard.notes![0],
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
        });
        return Response.json({ ok: true, noteId: 'note-1' });
      }
      return Response.error();
    });
    vi.stubGlobal('fetch', fetchMock);
    const { openNote } = renderProjects();

    fireEvent.click(await screen.findByRole('button', { name: 'Edit note Deploy antigo' }));

    expect(await screen.findByRole('dialog', { name: 'Edit note' })).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'Deploy revisado' } });
    fireEvent.change(screen.getByLabelText('Text'), { target: { value: 'confirmar deploy atualizado' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save note' }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/notes/note-1', expect.objectContaining({ method: 'PATCH' })));
    expect(notificationSpies.notifySuccess).toHaveBeenCalledWith('Note updated successfully.');
    expect(openNote).not.toHaveBeenCalled();
  });

  it('opens the folder modal from root with Root as the default parent', async () => {
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
          pagination: { page: 1, pageSize: 10, total: 0, totalPages: 1, hasNext: false, hasPrevious: false },
        });
      }
      return Response.error();
    }));
    renderProjects();

    fireEvent.click(await screen.findByRole('button', { name: 'New folder' }));

    const modal = await screen.findByRole('dialog', { name: 'New folder' });
    expect(within(modal).getByLabelText('Parent folder')).toHaveTextContent('Root');
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
          pagination: { page: 1, pageSize: 10, total: 0, totalPages: 1, hasNext: false, hasPrevious: false },
        });
      }
      return Response.error();
    }));
    renderProjects();

    fireEvent.click(await screen.findByRole('button', { name: 'Specs' }));

    expect(screen.queryByRole('button', { name: 'Nova subpasta' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'New folder' }));

    const createModal = await screen.findByRole('dialog', { name: 'New folder' });
    expect(within(createModal).getByLabelText('Parent folder')).toHaveTextContent('Specs');
    fireEvent.click(within(createModal).getByRole('button', { name: 'Cancel' }));

    fireEvent.click(screen.getByRole('button', { name: 'Edit folder Specs' }));

    expect(await screen.findByRole('dialog', { name: 'Edit folder' })).toBeInTheDocument();
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
          project: { ...dashboard.projects[1], displayName: 'Platform Core', repositories: [{ id: repoId, workspaceSlug: 'default', externalId: '102', fullName: 'acme/platform', htmlUrl: null, description: null, defaultBranch: null, createdAt: '', updatedAt: '' }] },
        });
      }
      return Response.error();
    });
    vi.stubGlobal('fetch', fetchMock);
    const { openProject } = renderProjects();

    fireEvent.click(screen.getByRole('button', { name: 'Edit project Platform' }));
    const repositoryCheckbox = await screen.findByRole('checkbox', { name: 'acme/platform Private' });
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Platform Core' } });
    fireEvent.click(repositoryCheckbox);
    fireEvent.click(screen.getByRole('button', { name: 'Save project' }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/projects/platform', expect.objectContaining({ method: 'PATCH' })));
    expect(notificationSpies.notifySuccess).toHaveBeenCalledWith('Project updated successfully.');
    expect(openProject).toHaveBeenCalledWith('platform');
  });

  it('deletes a note after confirmation and refreshes the dashboard', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input) === '/api/integrations?workspaceSlug=default') return Response.json(githubIntegrationsResponse());
      if (String(input) === '/api/integrations/github-app/repositories?workspaceSlug=default') return Response.json({ ok: true, workspaceSlug: 'default', repositories: [] });
      if (String(input).startsWith('/api/projects/platform/timeline?')) return Response.json(timelineFromDashboardNotes());
      expect(String(input)).toBe('/api/notes/note-1');
      expect(init?.method).toBe('DELETE');
      return Response.json({ ok: true, noteId: 'note-1' });
    });
    vi.stubGlobal('fetch', fetchMock);
    renderProjects();

    fireEvent.click(await screen.findByRole('button', { name: 'Delete note Deploy antigo' }));
    fireEvent.click(screen.getByRole('button', { name: 'Confirm deletion' }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/notes/note-1', expect.objectContaining({ method: 'DELETE' })));
    expect(notificationSpies.notifySuccess).toHaveBeenCalledWith('Note deleted successfully.');
  });

  it('blocks project deletion for inbox and projects with notes', () => {
    renderProjects({ selectedProject: 'inbox' });

    expect(screen.queryByRole('button', { name: 'Edit project Inbox' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Inbox cannot be changed.' })).toBeDisabled();

    cleanup();
    renderProjects({ selectedProject: 'platform' });

    expect(screen.getByRole('button', { name: 'Delete or move the project notes before removing it.' })).toBeDisabled();
  });

  it('shows only the focused project workspace without requesting the paginated project list', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === '/api/integrations?workspaceSlug=default') return Response.json(githubIntegrationsResponse());
      if (url === '/api/integrations/github-app/repositories?workspaceSlug=default') return Response.json({ ok: true, workspaceSlug: 'default', repositories: [] });
      if (url.startsWith('/api/projects/platform/timeline?')) {
        return Response.json({
          ok: true,
          timeline: [],
          pagination: { page: 1, pageSize: 10, total: 0, totalPages: 1, hasNext: false, hasPrevious: false },
        });
      }
      throw new Error(`unexpected fetch ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    renderProjects();

    expect(await screen.findByRole('heading', { name: 'Platform' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Inbox' })).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Empty' })).not.toBeInTheDocument();
    expect(fetchMock.mock.calls.some(([input]) => String(input).startsWith('/api/projects?'))).toBe(false);
  });

  it('fetches the canonical all timeline even when dashboard notes are empty for the project', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === '/api/integrations?workspaceSlug=default') return Response.json(githubIntegrationsResponse());
      if (url === '/api/integrations/github-app/repositories?workspaceSlug=default') return Response.json({ ok: true, workspaceSlug: 'default', repositories: [] });
      if (url.startsWith('/api/projects/empty/timeline?')) {
        return Response.json({
          ok: true,
          timeline: [
            {
              id: 'github-note-1',
              noteId: 'github-note-1',
              path: '30 Knowledge/empty/github.md',
              type: 'event',
              title: 'GitHub push processed',
              project: 'empty',
              workspace: 'default',
              folderId: null,
              tags: ['github'],
              date: '2026-05-19T10:00:00.000Z',
              status: 'active',
              summary: 'Push captured from GitHub.',
              source: 'github-push',
              sourceChannel: 'github-push',
              category: 'github-push',
              attachmentCount: 0,
            },
          ],
          pagination: { page: 1, pageSize: 10, total: 1, totalPages: 1, hasNext: false, hasPrevious: false },
        });
      }
      return Response.error();
    });
    vi.stubGlobal('fetch', fetchMock);

    renderProjects({ selectedProject: 'empty' });

    expect(await screen.findByRole('heading', { name: 'GitHub push processed' })).toBeInTheDocument();
    expect(fetchMock.mock.calls.some(([input]) => String(input).startsWith('/api/projects/empty/timeline?') && String(input).includes('category=all'))).toBe(true);
    expect(fetchMock.mock.calls.some(([input]) => String(input).startsWith('/api/projects/empty/timeline?') && String(input).includes('folderId='))).toBe(false);
  });

  it('filters the timeline by the selected folder', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
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
      if (url.startsWith('/api/projects/platform/timeline?') && url.includes('folderId=folder-1')) {
        return Response.json({
          ok: true,
          timeline: [
            {
              id: 'folder-note-1',
              noteId: 'folder-note-1',
              path: '30 Knowledge/platform/specs/note.md',
              type: 'event',
              title: 'Folder scoped note',
              project: 'platform',
              workspace: 'default',
              folderId: 'folder-1',
              tags: ['specs'],
              date: '2026-05-19T10:00:00.000Z',
              status: 'active',
              summary: 'Only appears after selecting Specs.',
              source: 'manual-api',
              sourceChannel: 'external',
              category: 'manual',
              attachmentCount: 0,
            },
          ],
          pagination: { page: 1, pageSize: 10, total: 1, totalPages: 1, hasNext: false, hasPrevious: false },
        });
      }
      if (url.startsWith('/api/projects/platform/timeline?')) {
        return Response.json({
          ok: true,
          timeline: [],
          pagination: { page: 1, pageSize: 10, total: 0, totalPages: 1, hasNext: false, hasPrevious: false },
        });
      }
      return Response.error();
    });
    vi.stubGlobal('fetch', fetchMock);

    renderProjects();

    fireEvent.click(await screen.findByRole('button', { name: 'Specs' }));

    expect(await screen.findByRole('heading', { name: 'Folder scoped note' })).toBeInTheDocument();
    expect(fetchMock.mock.calls.some(([input]) => String(input).startsWith('/api/projects/platform/timeline?') && String(input).includes('folderId=folder-1'))).toBe(true);
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

    fireEvent.click(screen.getByRole('button', { name: 'Delete project Empty' }));
    fireEvent.click(screen.getByRole('button', { name: 'Confirm deletion' }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/projects/empty', expect.objectContaining({ method: 'DELETE' })));
    expect(notificationSpies.notifySuccess).toHaveBeenCalledWith('Project deleted successfully.');
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
          message: 'Project slug is already registered.',
          details: { fieldErrors: { projectSlug: 'This project slug already exists.' } },
        },
        requestId: 'req-project',
      }, {
        status: 409,
        headers: { 'x-request-id': 'req-project' },
      });
    }));
    renderProjects();

    fireEvent.click(screen.getByRole('button', { name: 'New project' }));
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Billing API' } });
    fireEvent.change(screen.getByLabelText('Slug'), { target: { value: 'platform' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create project' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('This project slug already exists.');
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
          message: 'Invalid note payload.',
          details: { fieldErrors: { rawText: 'Enter the note text.' } },
        },
        requestId: 'req-note',
      }, {
        status: 400,
        headers: { 'x-request-id': 'req-note' },
      });
    }));
    renderProjects();

    fireEvent.click(screen.getByRole('button', { name: 'New note' }));
    fireEvent.change(screen.getByLabelText('Text'), { target: { value: 'confirmar deploy' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create note' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Enter the note text.');
    await waitFor(() => expect(screen.getByLabelText('Text')).toHaveFocus());
  });
});
