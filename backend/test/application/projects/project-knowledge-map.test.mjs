import test from 'node:test';
import assert from 'node:assert/strict';

import { buildProjectKnowledgeMap, ListProjectKnowledgeMapUseCase } from '../../../dist/application/use-cases/projects/list-project-knowledge-map.use-case.js';

const project = {
  projectSlug: 'platform',
  displayName: 'Platform',
  workspaceSlug: 'default',
  enabled: true,
  defaultTags: [],
  repositories: [
    {
      id: 'repo-1',
      workspaceSlug: 'default',
      externalId: '101',
      fullName: 'acme/api',
      htmlUrl: null,
      description: null,
      defaultBranch: 'main',
      createdAt: '2026-05-01T00:00:00.000Z',
      updatedAt: '2026-05-01T00:00:00.000Z',
    },
  ],
};

const folders = [
  {
    id: 'folder-1',
    projectSlug: 'platform',
    workspaceSlug: 'default',
    parentFolderId: null,
    displayName: 'Specs',
    folderSlug: 'specs',
    fullSlugPath: 'specs',
    createdAt: '2026-05-01T00:00:00.000Z',
    updatedAt: '2026-05-01T00:00:00.000Z',
  },
];

function note(overrides = {}) {
  return {
    id: 'note-1',
    path: '20 Inbox/platform/note.md',
    type: 'event',
    title: 'Deploy',
    projectSlug: 'platform',
    workspaceSlug: 'default',
    folderId: null,
    status: 'active',
    tags: ['deploy'],
    occurredAt: '2026-05-22T12:00:00.000Z',
    sourceChannel: 'manual',
    summary: 'Deploy summary',
    markdown: '',
    markdownStorageKey: '',
    frontmatter: {},
    metadata: {},
    origin: 'test',
    source: 'manual-api',
    links: [],
    attachmentCount: 0,
    ...overrides,
  };
}

test('buildProjectKnowledgeMap deduplicates tags and categories and links core nodes', () => {
  const result = buildProjectKnowledgeMap(project, folders, [
    note({ id: 'note-1', folderId: 'folder-1', tags: ['Deploy', 'deploy'], metadata: { repoFullName: 'acme/api' }, sourceChannel: 'github-push' }),
    note({ id: 'note-2', type: 'decision', title: 'Decision', tags: ['deploy', 'risk'] }),
  ]);

  const tagNodes = result.nodes.filter((node) => node.type === 'tag');
  const categoryNodes = result.nodes.filter((node) => node.type === 'category');

  assert.equal(result.stats.noteCount, 2);
  assert.deepEqual(tagNodes.map((node) => node.id).sort(), ['tag:deploy', 'tag:risk']);
  assert.deepEqual(categoryNodes.map((node) => node.id).sort(), ['category:decision', 'category:github-push']);
  assert.equal(result.nodes.find((node) => node.id === 'note:note-1')?.isReview, true);
  assert.equal(result.nodes.find((node) => node.id === 'note:note-2')?.isReview, false);
  assert.ok(result.links.some((link) => link.source === 'project:platform' && link.target === 'note:note-1' && link.type === 'contains'));
  assert.ok(result.links.some((link) => link.source === 'folder:folder-1' && link.target === 'note:note-1' && link.type === 'filed-in'));
  assert.ok(result.links.some((link) => link.source === 'note:note-1' && link.target === 'repository:repo-1' && link.type === 'from-repository'));
});

test('list project knowledge map rejects projects outside the user scope', async () => {
  const repository = {
    async getProjectBySlug() {
      return null;
    },
  };

  await assert.rejects(
    () => new ListProjectKnowledgeMapUseCase(repository).execute('user-1', {
      projectSlug: 'other-project',
      category: 'all',
      limit: 80,
    }),
    /project_not_found/,
  );
});

test('list project knowledge map expands selected folder to descendants', async () => {
  let receivedInput = null;
  const repository = {
    async getProjectBySlug() {
      return project;
    },
    async listProjectFolders() {
      return [
        folders[0],
        {
          ...folders[0],
          id: 'folder-2',
          parentFolderId: 'folder-1',
          displayName: 'Nested',
          folderSlug: 'nested',
          fullSlugPath: 'specs/nested',
        },
      ];
    },
    async listProjectKnowledgeMapItems(_userId, input) {
      receivedInput = input;
      return [];
    },
  };

  await new ListProjectKnowledgeMapUseCase(repository).execute('user-1', {
    projectSlug: 'platform',
    category: 'all',
    folderId: 'folder-1',
    limit: 80,
  });

  assert.deepEqual(receivedInput.folderIds.sort(), ['folder-1', 'folder-2']);
  assert.equal(receivedInput.folderId, undefined);
});
