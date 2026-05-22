import { cleanup, screen } from '@testing-library/react';
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
      user: { id: 'user-1', email: 'ada@example.com', displayName: 'Ada Lovelace', role: 'owner' },
    })));

    renderWithAppProviders(<ProfilePage workspace={workspace} />);

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
});
