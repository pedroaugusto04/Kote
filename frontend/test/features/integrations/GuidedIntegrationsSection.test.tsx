import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
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
              primaryAction: { type: 'connect', label: 'Conectar WhatsApp' },
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
            message: 'Nao foi possivel iniciar o pareamento.',
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

    fireEvent.click(await screen.findByRole('button', { name: 'Conectar WhatsApp' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Nao foi possivel iniciar o pareamento.');
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
            message: 'Nao foi possivel carregar os repositorios agora.',
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

    fireEvent.click(await screen.findByRole('button', { name: 'Repositorios' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Nao foi possivel carregar os repositorios agora.');
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
            { fullName: 'acme/repo', name: 'repo', owner: 'acme', private: true, htmlUrl: 'https://github.com/acme/repo', selected: false },
          ],
        });
      }
      if (url === '/api/integrations/github-app/repositories') {
        return Response.json({ ok: true });
      }
      return new Response(null, { status: 404 });
    }));

    renderWithAppProviders(<GuidedIntegrationsSection returnToPath="/setup" workspaceSlug="default" providers={['github-app']} />);

    fireEvent.click(await screen.findByRole('button', { name: 'Repositorios' }));
    fireEvent.click(await screen.findByRole('checkbox'));
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));

    await waitFor(() => expect(notificationSpies.notifySuccess).toHaveBeenCalledWith('Repositorios salvos com sucesso.'));
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
            { fullName: 'acme/repo', name: 'repo', owner: 'acme', private: true, htmlUrl: 'https://github.com/acme/repo', selected: false },
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

    fireEvent.click(await screen.findByRole('button', { name: 'Repositorios' }));
    const checkbox = await screen.findByRole('checkbox');
    fireEvent.click(checkbox);
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Selecione repositorios validos.');
    await waitFor(() => expect(checkbox).toHaveFocus());
  });
});
