import test from 'node:test';
import assert from 'node:assert/strict';

import {
  folderSlugFromDisplayName,
  buildFolderFullSlugPath,
  buildProjectFolderTree,
  collectFolderDescendantIds,
  collectFolderAncestorIds,
  buildFolderSummary,
} from '../../../../dist/application/utils/content/project-folder.utils.js';

test('folderSlugFromDisplayName slugifies folder display name', () => {
  assert.equal(folderSlugFromDisplayName('Architecture & Design'), 'architecture-design');
  assert.equal(folderSlugFromDisplayName(''), 'folder');
});

test('buildFolderFullSlugPath joins parent and child slug', () => {
  assert.equal(buildFolderFullSlugPath('docs', 'api'), 'docs/api');
  assert.equal(buildFolderFullSlugPath('', 'api'), 'api');
});

test('collectFolderDescendantIds returns descendants recursively', () => {
  const folders = [
    { id: '1', parentFolderId: null, displayName: 'Root 1' },
    { id: '2', parentFolderId: '1', displayName: 'Child 1.1' },
    { id: '3', parentFolderId: '2', displayName: 'Child 1.1.1' },
    { id: '4', parentFolderId: null, displayName: 'Root 2' },
  ];

  const descendants = collectFolderDescendantIds(folders, '1');
  assert.deepEqual(descendants.sort(), ['1', '2', '3']);
});

test('collectFolderAncestorIds returns all ancestor ids for selected folders', () => {
  const folders = [
    { id: '1', parentFolderId: null, displayName: 'Root 1' },
    { id: '2', parentFolderId: '1', displayName: 'Child 1.1' },
    { id: '3', parentFolderId: '2', displayName: 'Child 1.1.1' },
    { id: '4', parentFolderId: null, displayName: 'Root 2' },
  ];

  const ancestors = collectFolderAncestorIds(folders, new Set(['3']));
  assert.deepEqual(Array.from(ancestors).sort(), ['1', '2', '3']);
});

test('buildFolderSummary computes hierarchical path string', () => {
  const folders = [
    { id: '1', parentFolderId: null, displayName: 'Docs' },
    { id: '2', parentFolderId: '1', displayName: 'API' },
    { id: '3', parentFolderId: '2', displayName: 'v1' },
  ];

  const summary = buildFolderSummary(folders, folders[2]);
  assert.equal(summary.folderName, 'v1');
  assert.equal(summary.folderPath, 'Docs / API / v1');
});
