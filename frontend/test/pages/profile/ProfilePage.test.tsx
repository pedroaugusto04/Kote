import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { renderWithAppProviders } from '../../../src/app/test-utils';
import { ProfilePage } from '../../../src/pages/profile/ProfilePage';

const workspace = {
  workspaceSlug: 'default',
  displayName: 'Default',
  githubRepos: ['acme/repo'],
  projectSlugs: ['n8n-automations'],
};

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('ProfilePage', () => {
  it('shows a loading state while profile details are requested', async () => {
    vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>(() => undefined)));

    renderWithAppProviders(<ProfilePage workspace={workspace} />);

    expect(await screen.findByRole('status')).toHaveTextContent('Loading profile...');
  });

  it('shows the current user and workspace details', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({
      ok: true,
      user: { id: 'user-1', email: 'ada@example.com', displayName: 'Ada Lovelace', role: 'owner', avatarUrl: null },
    })));

    renderWithAppProviders(<ProfilePage workspace={workspace} />);

    expect(await screen.findByText('AL')).toBeInTheDocument();
    expect(await screen.findByText('Ada Lovelace')).toBeInTheDocument();
    expect(screen.getByText('ada@example.com')).toBeInTheDocument();
    expect(screen.getByText('owner')).toBeInTheDocument();
    expect(screen.getByText('Default')).toBeInTheDocument();
    expect(screen.getByText('default')).toBeInTheDocument();
  });

  it('shows an error state when profile details cannot be loaded', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({ message: 'Request failed.' }, { status: 500 })));

    renderWithAppProviders(<ProfilePage workspace={workspace} />);

    expect(await screen.findByRole('alert')).toHaveTextContent('Could not load your profile details.');
  });

  it('uploads a profile photo and shows the returned avatar', async () => {
    let avatarUrl: string | null = null;
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === '/api/auth/me') {
        return Response.json({
          ok: true,
          user: { id: 'user-1', email: 'ada@example.com', displayName: 'Ada Lovelace', role: 'owner', avatarUrl },
        });
      }
      if (url === '/api/auth/avatar' && init?.method === 'PUT') {
        expect(init.body).toBeInstanceOf(FormData);
        avatarUrl = '/api/auth/avatar/content?v=1';
        return Response.json({
          ok: true,
          user: { id: 'user-1', email: 'ada@example.com', displayName: 'Ada Lovelace', role: 'owner', avatarUrl },
        });
      }
      return new Response(null, { status: 404 });
    });
    vi.stubGlobal('fetch', fetchMock);

    renderWithAppProviders(<ProfilePage workspace={workspace} />);

    const file = new File(['avatar'], 'avatar.png', { type: 'image/png' });
    fireEvent.change(await screen.findByLabelText('Change photo'), { target: { files: [file] } });

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith('/api/auth/avatar', expect.objectContaining({ method: 'PUT' }));
    });
    expect(document.querySelector('.profile-avatar img')).toHaveAttribute('src', '/api/auth/avatar/content?v=1');
  });

  it('shows the backend message when the profile photo is too large', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === '/api/auth/me') {
        return Response.json({
          ok: true,
          user: { id: 'user-1', email: 'ada@example.com', displayName: 'Ada Lovelace', role: 'owner', avatarUrl: null },
        });
      }
      if (url === '/api/auth/avatar' && init?.method === 'PUT') {
        return Response.json({
          ok: false,
          error: {
            code: 'avatar_file_too_large',
            message: 'Profile photo must be 2 MB or smaller.',
            details: {},
          },
          requestId: 'req-avatar',
        }, { status: 413 });
      }
      return new Response(null, { status: 404 });
    });
    vi.stubGlobal('fetch', fetchMock);

    renderWithAppProviders(<ProfilePage workspace={workspace} />);

    const file = new File(['large-avatar'], 'avatar.png', { type: 'image/png' });
    fireEvent.change(await screen.findByLabelText('Change photo'), { target: { files: [file] } });

    expect(await screen.findByRole('alert')).toHaveTextContent('Profile photo must be 2 MB or smaller.');
  });

  it('removes a profile photo and returns to initials fallback', async () => {
    let avatarUrl: string | null = '/api/auth/avatar/content?v=1';
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === '/api/auth/me') {
        return Response.json({
          ok: true,
          user: { id: 'user-1', email: 'ada@example.com', displayName: 'Ada Lovelace', role: 'owner', avatarUrl },
        });
      }
      if (url === '/api/auth/avatar' && init?.method === 'DELETE') {
        avatarUrl = null;
        return Response.json({
          ok: true,
          user: { id: 'user-1', email: 'ada@example.com', displayName: 'Ada Lovelace', role: 'owner', avatarUrl: null },
        });
      }
      return new Response(null, { status: 404 });
    });
    vi.stubGlobal('fetch', fetchMock);

    renderWithAppProviders(<ProfilePage workspace={workspace} />);

    fireEvent.click(await screen.findByRole('button', { name: 'Remove photo' }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith('/api/auth/avatar', expect.objectContaining({ method: 'DELETE' }));
    });
    expect(await screen.findByText('AL')).toBeInTheDocument();
  });
});
