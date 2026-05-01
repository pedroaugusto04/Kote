import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { renderWithAppProviders } from '../../../src/app/test-utils';
import { SetupPage } from '../../../src/pages/setup/SetupPage';

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

const emptyDashboard = {
  workspaces: [],
  projects: [],
  notes: [],
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

describe('SetupPage', () => {
  it('shows the backend message inline when workspace creation fails', async () => {
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      if (String(input) === '/api/workspaces') {
        return Response.json({
          ok: false,
          error: {
            code: 'workspace_exists',
            message: 'Workspace ja existe.',
            details: { fieldErrors: { workspaceSlug: 'Workspace ja existe.' } },
          },
          requestId: 'req-workspace',
        }, {
          status: 409,
          headers: { 'x-request-id': 'req-workspace' },
        });
      }
      return new Response(null, { status: 404 });
    }));

    renderWithAppProviders(<SetupPage dashboard={emptyDashboard} refetchDashboard={vi.fn()} />);

    fireEvent.change(screen.getByLabelText('Nome do workspace'), { target: { value: 'Acme Team' } });
    await waitFor(() => expect(screen.getByLabelText('Slug do workspace')).toHaveValue('acme-team'));
    fireEvent.click(screen.getByRole('button', { name: 'Criar workspace' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Workspace ja existe.');
    await waitFor(() => expect(screen.getByLabelText('Slug do workspace')).toHaveFocus());
  });

  it('emits an error toast when workspace creation fails without field errors', async () => {
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      if (String(input) === '/api/workspaces') {
        return Response.json({
          ok: false,
          error: {
            code: 'workspace_unavailable',
            message: 'Nao foi possivel criar agora.',
            details: {},
          },
          requestId: 'req-workspace',
        }, {
          status: 503,
          headers: { 'x-request-id': 'req-workspace' },
        });
      }
      return new Response(null, { status: 404 });
    }));

    renderWithAppProviders(<SetupPage dashboard={emptyDashboard} refetchDashboard={vi.fn()} />);

    fireEvent.change(screen.getByLabelText('Nome do workspace'), { target: { value: 'Acme Team' } });
    await waitFor(() => expect(screen.getByLabelText('Slug do workspace')).toHaveValue('acme-team'));
    fireEvent.click(screen.getByRole('button', { name: 'Criar workspace' }));

    await waitFor(() => expect(notificationSpies.notifyError).toHaveBeenCalledWith('Nao foi possivel criar agora.'));
  });

  it('emits a success toast after creating a workspace', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      if (String(input) === '/api/workspaces') {
        return Response.json({
          ok: true,
          workspace: {
            workspaceSlug: 'acme-team',
            displayName: 'Acme Team',
            githubRepos: [],
            projectSlugs: ['inbox'],
          },
          initialProject: {
            projectSlug: 'inbox',
            displayName: 'Inbox',
            repositories: [],
            workspaceSlug: 'acme-team',
            aliases: [],
            defaultTags: [],
            enabled: true,
          },
        });
      }
      return new Response(null, { status: 404 });
    });
    vi.stubGlobal('fetch', fetchMock);

    renderWithAppProviders(<SetupPage dashboard={emptyDashboard} refetchDashboard={vi.fn()} />);

    fireEvent.change(screen.getByLabelText('Nome do workspace'), { target: { value: 'Acme Team' } });
    await waitFor(() => expect(screen.getByLabelText('Slug do workspace')).toHaveValue('acme-team'));
    fireEvent.click(screen.getByRole('button', { name: 'Criar workspace' }));

    await waitFor(() => expect(notificationSpies.notifySuccess).toHaveBeenCalledWith('Workspace criado com sucesso.'));
    const [, requestInit] = fetchMock.mock.calls.find(([input]) => String(input) === '/api/workspaces') || [];
    expect(JSON.parse(String((requestInit as RequestInit).body))).toEqual({
      displayName: 'Acme Team',
      workspaceSlug: 'acme-team',
    });
  });
});
