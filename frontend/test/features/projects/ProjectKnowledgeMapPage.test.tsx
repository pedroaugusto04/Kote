import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { renderWithAppProviders } from '../../../src/app/test-utils';
import { ProjectKnowledgeMapPage } from '../../../src/features/projects/knowledge-map/ProjectKnowledgeMapPage';
import { filterKnowledgeMapDataset } from '../../../src/features/projects/knowledge-map/knowledge-map.helpers';
import type { Dashboard } from '../../../src/shared/api/models/dashboard';
import type { ProjectKnowledgeMapResponse } from '../../../src/shared/api/models/project-knowledge-map';
import type { ProjectFolder } from '../../../src/shared/api/models/project-folder';

const dashboard: Dashboard = {
  workspaces: [{ workspaceSlug: 'default', displayName: 'Default' }],
  projects: [
    {
      projectSlug: 'platform',
      displayName: 'Platform',
      repositories: [],
      workspaceSlug: 'default',
      defaultTags: [],
      enabled: true,
    },
  ],
  notes: [],
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

function graphResponse(overrides: Partial<ProjectKnowledgeMapResponse> = {}): ProjectKnowledgeMapResponse {
  return {
    ok: true,
    projectSlug: 'platform',
    nodes: [
      { id: 'project:platform', type: 'project', label: 'Platform', projectSlug: 'platform' },
      { id: 'folder:folder-1', type: 'folder', label: 'Operations', projectSlug: 'platform' },
      { id: 'note:note-1', type: 'note', label: 'Deploy', noteId: 'note-1', projectSlug: 'platform', category: 'manual' },
      { id: 'tag:deploy', type: 'tag', label: 'deploy', projectSlug: 'platform' },
      { id: 'category:manual', type: 'category', label: 'Manual', projectSlug: 'platform', category: 'manual' },
    ],
    links: [
      { id: 'contains:project:platform->folder:folder-1', source: 'project:platform', target: 'folder:folder-1', type: 'contains' },
      { id: 'contains:project:platform->note:note-1', source: 'project:platform', target: 'note:note-1', type: 'contains' },
      { id: 'filed-in:folder:folder-1->note:note-1', source: 'folder:folder-1', target: 'note:note-1', type: 'filed-in' },
      { id: 'tagged-with:note:note-1->tag:deploy', source: 'note:note-1', target: 'tag:deploy', type: 'tagged-with' },
      { id: 'classified-as:note:note-1->category:manual', source: 'note:note-1', target: 'category:manual', type: 'classified-as' },
    ],
    stats: {
      noteCount: 1,
      tagCount: 1,
      folderCount: 1,
      repositoryCount: 0,
    },
    ...overrides,
  };
}

const folders: ProjectFolder[] = [{
  id: 'folder-1',
  projectSlug: 'platform',
  workspaceSlug: 'default',
  parentFolderId: null,
  displayName: 'Operations',
  folderSlug: 'operations',
  fullSlugPath: 'operations',
  children: [],
}];

function stubMapFetch(response = graphResponse()) {
  const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url === '/api/projects/platform/folders') return Response.json({ ok: true, projectSlug: 'platform', folders });
    if (url.startsWith('/api/projects/platform/knowledge-map?')) return Response.json(response);
    return new Response(null, { status: 404 });
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

function renderMap(openNote = vi.fn()) {
  renderWithAppProviders(
    <Routes>
      <Route path="/map/:projectSlug" element={<ProjectKnowledgeMapPage dashboard={dashboard} openNote={openNote} selectedProject="platform" />} />
    </Routes>,
    { route: '/map/platform' },
  );
  return { openNote };
}

describe('ProjectKnowledgeMapPage', () => {
  it('loads the project knowledge map with default filters and renders graph controls and legend', async () => {
    const fetchMock = stubMapFetch();

    renderMap();

    expect(await screen.findByRole('img', { name: 'Project knowledge map' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Pause' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Reset view' })).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Knowledge map category' })).toHaveValue('all');
    expect(screen.getByRole('combobox', { name: 'Knowledge map folder' })).toHaveValue('');
    expect(screen.getByRole('combobox', { name: 'Knowledge map volume' })).toHaveValue('80');
    const nodeTypes = screen.getByLabelText('Knowledge map node types');
    expect(within(nodeTypes).getByLabelText('Tag')).not.toBeChecked();
    expect(within(nodeTypes).getByLabelText('Category')).not.toBeChecked();
    expect(within(nodeTypes).getByLabelText('Review notes')).toBeChecked();
    expect(screen.getByLabelText('Knowledge map stats')).toHaveTextContent('1 notes');
    expect(screen.getByLabelText('Knowledge map stats')).toHaveTextContent('1 folders');
    expect(screen.getByLabelText('Knowledge map legend')).toHaveTextContent('Project');
    expect(screen.getByLabelText('Knowledge map legend')).not.toHaveTextContent('Tag');
    expect(fetchMock).toHaveBeenCalledWith('/api/projects/platform/knowledge-map?limit=80&category=all', expect.anything());
  });

  it('updates category, folder, and volume filters', async () => {
    const fetchMock = stubMapFetch();
    renderMap();

    await screen.findByRole('img', { name: 'Project knowledge map' });
    fireEvent.change(screen.getByRole('combobox', { name: 'Knowledge map category' }), { target: { value: 'manual' } });
    fireEvent.change(screen.getByRole('combobox', { name: 'Knowledge map folder' }), { target: { value: 'folder-1' } });
    fireEvent.change(screen.getByRole('combobox', { name: 'Knowledge map volume' }), { target: { value: '120' } });

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith('/api/projects/platform/knowledge-map?limit=120&category=manual&folderId=folder-1', expect.anything());
    });
  });

  it('toggles node types and keeps pause and resume available', async () => {
    stubMapFetch();
    renderMap();

    await screen.findByRole('img', { name: 'Project knowledge map' });
    const nodeTypes = screen.getByLabelText('Knowledge map node types');

    expect(screen.getByLabelText('Knowledge map legend')).not.toHaveTextContent('Tag');
    fireEvent.click(within(nodeTypes).getByLabelText('Tag'));
    expect(screen.getByLabelText('Knowledge map legend')).toHaveTextContent('Tag');

    fireEvent.click(screen.getByRole('button', { name: 'Pause' }));
    expect(screen.getByRole('button', { name: 'Resume' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Resume' }));
    expect(screen.getByRole('button', { name: 'Pause' })).toBeInTheDocument();
  });

  it('opens note nodes from the map', async () => {
    stubMapFetch();
    const { openNote } = renderMap();

    fireEvent.click(await screen.findByRole('button', { name: 'Open note Deploy' }));

    expect(openNote).toHaveBeenCalledWith('note-1');
  });

  it('shows an empty state when the project has no notes to map', async () => {
    stubMapFetch(graphResponse({
      nodes: [{ id: 'project:platform', type: 'project', label: 'Platform', projectSlug: 'platform' }],
      links: [],
      stats: { noteCount: 0, tagCount: 0, folderCount: 0, repositoryCount: 0 },
    }));

    renderMap();

    expect(await screen.findByText('No recent project notes to map yet.')).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole('img', { name: 'Project knowledge map' })).not.toBeInTheDocument());
  });
});

describe('filterKnowledgeMapDataset', () => {
  it('removes links connected to hidden node types', () => {
    const dataset = graphResponse();

    const filtered = filterKnowledgeMapDataset(dataset, new Set(['project', 'folder', 'note']));

    expect(filtered.nodes.map((node) => node.type)).toEqual(['project', 'folder', 'note']);
    expect(filtered.links.map((link) => link.id)).toEqual([
      'contains:project:platform->folder:folder-1',
      'contains:project:platform->note:note-1',
      'filed-in:folder:folder-1->note:note-1',
    ]);
  });

  it('can hide review note nodes and their links', () => {
    const dataset = graphResponse({
      nodes: [
        ...graphResponse().nodes,
        { id: 'note:review-1', type: 'note', label: 'Review', noteId: 'review-1', projectSlug: 'platform', category: 'github-push', isReview: true },
      ],
      links: [
        ...graphResponse().links,
        { id: 'contains:project:platform->note:review-1', source: 'project:platform', target: 'note:review-1', type: 'contains' },
        { id: 'classified-as:note:review-1->category:manual', source: 'note:review-1', target: 'category:manual', type: 'classified-as' },
      ],
    });

    const filtered = filterKnowledgeMapDataset(dataset, new Set(['project', 'folder', 'note', 'tag', 'category']), { includeReviewNotes: false });

    expect(filtered.nodes.map((node) => node.id)).not.toContain('note:review-1');
    expect(filtered.links.map((link) => link.id)).not.toContain('contains:project:platform->note:review-1');
    expect(filtered.links.map((link) => link.id)).not.toContain('classified-as:note:review-1->category:manual');
  });
});
