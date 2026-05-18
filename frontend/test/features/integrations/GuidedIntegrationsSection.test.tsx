import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { renderWithAppProviders } from '../../../src/app/test-utils';
import { GuidedIntegrationsSection } from '../../../src/features/integrations/GuidedIntegrationsSection';

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

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe('GuidedIntegrationsSection', () => {
  it('auto-opens the repositories modal after returning connected from the github callback flow', async () => {
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === '/api/integrations?workspaceSlug=default') {
        return Response.json({
          ok: true,
          workspaceSlug: 'default',
          integrations: [
            {
              provider: 'github-app',
              name: 'GitHub App',
              description: 'GitHub App installation data.',
              status: 'connected',
              workspaceSlug: 'default',
              publicMetadata: {},
              primaryAction: { type: 'revoke', label: 'Revoke' },
              steps: ['Integration connected.'],
              lastError: null,
              connectedAccount: 'acme',
              updatedAt: '2026-04-27T10:00:00.000Z',
              revokedAt: null,
            },
          ],
        });
      }
      if (url === '/api/integrations/github-app/repositories?workspaceSlug=default') {
        return Response.json({
          ok: true,
          workspaceSlug: 'default',
          repositories: [
            { id: '101', fullName: 'acme/repo', name: 'repo', owner: 'acme', private: true, htmlUrl: 'https://github.com/acme/repo', selected: false },
          ],
        });
      }
      return new Response(null, { status: 404 });
    }));

    renderWithAppProviders(
      <GuidedIntegrationsSection
        returnToPath="/setup"
        workspaceSlug="default"
        providers={['github-app']}
        defaultOpenGithubRepositories
      />,
    );

    expect(await screen.findByRole('dialog', { name: 'Select repositories' })).toBeInTheDocument();
    expect(notificationSpies.notifySuccess).not.toHaveBeenCalled();
  });

  it('closes the repositories modal immediately when nothing changed', async () => {
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === '/api/integrations?workspaceSlug=default') {
        return Response.json({
          ok: true,
          workspaceSlug: 'default',
          integrations: [
            {
              provider: 'github-app',
              name: 'GitHub App',
              description: 'Dados de instalacao do GitHub App.',
              status: 'connected',
              workspaceSlug: 'default',
              publicMetadata: {},
              primaryAction: { type: 'revoke', label: 'Revogar' },
              steps: ['Integracao conectada.'],
              lastError: null,
              connectedAccount: 'acme',
              updatedAt: '2026-04-27T10:00:00.000Z',
              revokedAt: null,
            },
          ],
        });
      }
      if (url === '/api/integrations/github-app/repositories?workspaceSlug=default') {
        return Response.json({
          ok: true,
          workspaceSlug: 'default',
          repositories: [
            { id: '101', fullName: 'acme/repo', name: 'repo', owner: 'acme', private: true, htmlUrl: 'https://github.com/acme/repo', selected: true },
          ],
        });
      }
      return new Response(null, { status: 404 });
    }));

    renderWithAppProviders(<GuidedIntegrationsSection returnToPath="/setup" workspaceSlug="default" providers={['github-app']} />);

    fireEvent.click(await screen.findByRole('button', { name: 'Repositories' }));
    const modal = await screen.findByRole('dialog', { name: 'Select repositories' });
    fireEvent.click(within(modal).getByRole('button', { name: 'Cancel' }));

    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Select repositories' })).not.toBeInTheDocument());
    expect(screen.queryByRole('dialog', { name: 'Discard changes?' })).not.toBeInTheDocument();
  });

  it('asks for confirmation before discarding repository selection changes and closes after confirmation', async () => {
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === '/api/integrations?workspaceSlug=default') {
        return Response.json({
          ok: true,
          workspaceSlug: 'default',
          integrations: [
            {
              provider: 'github-app',
              name: 'GitHub App',
              description: 'GitHub App installation data.',
              status: 'connected',
              workspaceSlug: 'default',
              publicMetadata: {},
              primaryAction: { type: 'revoke', label: 'Revoke' },
              steps: ['Integration connected.'],
              lastError: null,
              connectedAccount: 'acme',
              updatedAt: '2026-04-27T10:00:00.000Z',
              revokedAt: null,
            },
          ],
        });
      }
      if (url === '/api/integrations/github-app/repositories?workspaceSlug=default') {
        return Response.json({
          ok: true,
          workspaceSlug: 'default',
          repositories: [
            { id: '101', fullName: 'acme/repo', name: 'repo', owner: 'acme', private: true, htmlUrl: 'https://github.com/acme/repo', selected: false },
          ],
        });
      }
      return new Response(null, { status: 404 });
    }));

    renderWithAppProviders(<GuidedIntegrationsSection returnToPath="/setup" workspaceSlug="default" providers={['github-app']} />);

    fireEvent.click(await screen.findByRole('button', { name: 'Repositories' }));
    const modal = await screen.findByRole('dialog', { name: 'Select repositories' });
    fireEvent.click(await within(modal).findByRole('checkbox'));
    fireEvent.click(within(modal).getByRole('button', { name: 'Close details' }));

    expect(screen.getByRole('dialog', { name: 'Discard changes?' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Close without saving' }));

    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Select repositories' })).not.toBeInTheDocument());
  });

  it('keeps repository selection changes when discard is canceled', async () => {
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === '/api/integrations?workspaceSlug=default') {
        return Response.json({
          ok: true,
          workspaceSlug: 'default',
          integrations: [
            {
              provider: 'github-app',
              name: 'GitHub App',
              description: 'Dados de instalacao do GitHub App.',
              status: 'connected',
              workspaceSlug: 'default',
              publicMetadata: {},
              primaryAction: { type: 'revoke', label: 'Revogar' },
              steps: ['Integracao conectada.'],
              lastError: null,
              connectedAccount: 'acme',
              updatedAt: '2026-04-27T10:00:00.000Z',
              revokedAt: null,
            },
          ],
        });
      }
      if (url === '/api/integrations/github-app/repositories?workspaceSlug=default') {
        return Response.json({
          ok: true,
          workspaceSlug: 'default',
          repositories: [
            { id: '101', fullName: 'acme/repo', name: 'repo', owner: 'acme', private: true, htmlUrl: 'https://github.com/acme/repo', selected: false },
          ],
        });
      }
      return new Response(null, { status: 404 });
    }));

    renderWithAppProviders(<GuidedIntegrationsSection returnToPath="/setup" workspaceSlug="default" providers={['github-app']} />);

    fireEvent.click(await screen.findByRole('button', { name: 'Repositories' }));
    const modal = await screen.findByRole('dialog', { name: 'Select repositories' });
    fireEvent.click(await within(modal).findByRole('checkbox'));
    fireEvent.click(screen.getByRole('presentation'));

    expect(screen.getByRole('dialog', { name: 'Discard changes?' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Keep editing' }));

    expect(screen.getByRole('dialog', { name: 'Select repositories' })).toBeInTheDocument();
    expect(screen.getByRole('checkbox')).toBeChecked();
  });

  it('shows the backend message inline when an integration activation fails', async () => {
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === '/api/integrations?workspaceSlug=default') {
        return Response.json({
          ok: true,
          workspaceSlug: 'default',
          integrations: [
            {
              provider: 'whatsapp',
              name: 'WhatsApp',
              description: 'Grupo autorizado para captura.',
              status: 'missing',
              workspaceSlug: 'default',
              publicMetadata: {},
              primaryAction: { type: 'connect', label: 'Connect WhatsApp' },
              steps: ['Inicie a conexao.'],
              lastError: null,
              connectedAccount: null,
              updatedAt: null,
              revokedAt: null,
            },
          ],
        });
      }
      if (url === '/api/integrations/whatsapp/connect') {
        return Response.json({
          ok: false,
          error: {
            code: 'pairing_unavailable',
            message: 'Could not start pairing.',
            details: {},
          },
          requestId: 'req-pairing',
        }, {
          status: 503,
          headers: { 'x-request-id': 'req-pairing' },
        });
      }
      return new Response(null, { status: 404 });
    }));

    renderWithAppProviders(<GuidedIntegrationsSection returnToPath="/setup" workspaceSlug="default" providers={['whatsapp']} />);

    fireEvent.click(await screen.findByRole('button', { name: 'Connect WhatsApp' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Could not start pairing.');
  });

  it('shows inline query errors for the GitHub repositories modal', async () => {
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === '/api/integrations?workspaceSlug=default') {
        return Response.json({
          ok: true,
          workspaceSlug: 'default',
          integrations: [
            {
              provider: 'github-app',
              name: 'GitHub App',
              description: 'Dados de instalacao do GitHub App.',
              status: 'connected',
              workspaceSlug: 'default',
              publicMetadata: {},
              primaryAction: { type: 'revoke', label: 'Revogar' },
              steps: ['Integracao conectada.'],
              lastError: null,
              connectedAccount: 'acme',
              updatedAt: '2026-04-27T10:00:00.000Z',
              revokedAt: null,
            },
          ],
        });
      }
      if (url === '/api/integrations/github-app/repositories?workspaceSlug=default') {
        return Response.json({
          ok: false,
          error: {
            code: 'github_unavailable',
            message: 'Could not load repositories right now.',
            details: {},
          },
          requestId: 'req-github-repos',
        }, {
          status: 502,
          headers: { 'x-request-id': 'req-github-repos' },
        });
      }
      return new Response(null, { status: 404 });
    }));

    renderWithAppProviders(<GuidedIntegrationsSection returnToPath="/setup" workspaceSlug="default" providers={['github-app']} />);

    fireEvent.click(await screen.findByRole('button', { name: 'Repositories' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Could not load repositories right now.');
  });

  it('emits a success toast after saving GitHub repositories', async () => {
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === '/api/integrations?workspaceSlug=default') {
        return Response.json({
          ok: true,
          workspaceSlug: 'default',
          integrations: [
            {
              provider: 'github-app',
              name: 'GitHub App',
              description: 'Dados de instalacao do GitHub App.',
              status: 'connected',
              workspaceSlug: 'default',
              publicMetadata: {},
              primaryAction: { type: 'revoke', label: 'Revogar' },
              steps: ['Integracao conectada.'],
              lastError: null,
              connectedAccount: 'acme',
              updatedAt: '2026-04-27T10:00:00.000Z',
              revokedAt: null,
            },
          ],
        });
      }
      if (url === '/api/integrations/github-app/repositories?workspaceSlug=default') {
        return Response.json({
          ok: true,
          workspaceSlug: 'default',
          repositories: [
            { id: '101', fullName: 'acme/repo', name: 'repo', owner: 'acme', private: true, htmlUrl: 'https://github.com/acme/repo', selected: false },
          ],
        });
      }
      if (url === '/api/integrations/github-app/repositories') {
        return Response.json({ ok: true });
      }
      return new Response(null, { status: 404 });
    }));

    renderWithAppProviders(<GuidedIntegrationsSection returnToPath="/setup" workspaceSlug="default" providers={['github-app']} />);

    fireEvent.click(await screen.findByRole('button', { name: 'Repositories' }));
    fireEvent.click(await screen.findByRole('checkbox'));
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(notificationSpies.notifySuccess).toHaveBeenCalledWith('Repositories saved successfully.'));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Select repositories' })).not.toBeInTheDocument());
    expect(screen.queryByRole('dialog', { name: 'Discard changes?' })).not.toBeInTheDocument();
  });

  it('shows backend field errors inline when saving GitHub repositories fails', async () => {
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === '/api/integrations?workspaceSlug=default') {
        return Response.json({
          ok: true,
          workspaceSlug: 'default',
          integrations: [
            {
              provider: 'github-app',
              name: 'GitHub App',
              description: 'Dados de instalacao do GitHub App.',
              status: 'connected',
              workspaceSlug: 'default',
              publicMetadata: {},
              primaryAction: { type: 'revoke', label: 'Revogar' },
              steps: ['Integracao conectada.'],
              lastError: null,
              connectedAccount: 'acme',
              updatedAt: '2026-04-27T10:00:00.000Z',
              revokedAt: null,
            },
          ],
        });
      }
      if (url === '/api/integrations/github-app/repositories?workspaceSlug=default') {
        return Response.json({
          ok: true,
          workspaceSlug: 'default',
          repositories: [
            { id: '101', fullName: 'acme/repo', name: 'repo', owner: 'acme', private: true, htmlUrl: 'https://github.com/acme/repo', selected: false },
          ],
        });
      }
      if (url === '/api/integrations/github-app/repositories') {
        return Response.json({
          ok: false,
          error: {
            code: 'invalid_github_repositories_payload',
            message: 'Payload de repositorios invalido.',
            details: { fieldErrors: { repositories: 'Selecione repositorios validos.' } },
          },
          requestId: 'req-save-repos',
        }, {
          status: 400,
          headers: { 'x-request-id': 'req-save-repos' },
        });
      }
      return new Response(null, { status: 404 });
    }));

    renderWithAppProviders(<GuidedIntegrationsSection returnToPath="/setup" workspaceSlug="default" providers={['github-app']} />);

    fireEvent.click(await screen.findByRole('button', { name: 'Repositories' }));
    const checkbox = await screen.findByRole('checkbox');
    fireEvent.click(checkbox);
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Selecione repositorios validos.');
    await waitFor(() => expect(checkbox).toHaveFocus());
  });
});
