import test from 'node:test';
import assert from 'node:assert/strict';

import { resolveCategoryIds } from '../../../../dist/application/utils/content/category-resolution.utils.js';

test('resolveCategoryIds returns providedCategoryIds when defined', async () => {
  const contentRepo = {};
  const result = await resolveCategoryIds(contentRepo, 'user-1', 'ws-1', 'incident', ['cat-1', 'cat-2']);
  assert.deepEqual(result, ['cat-1', 'cat-2']);
});

test('resolveCategoryIds returns empty array when canonicalType is empty', async () => {
  const contentRepo = {};
  const result = await resolveCategoryIds(contentRepo, 'user-1', 'ws-1', undefined);
  assert.deepEqual(result, []);
});

test('resolveCategoryIds returns existing category id when found by name', async () => {
  const contentRepo = {
    findCategoryByName: async (userId, wsId, name) => {
      assert.equal(userId, 'user-1');
      assert.equal(wsId, 'ws-1');
      assert.equal(name, 'incident');
      return { id: 'cat-existing' };
    },
  };

  const result = await resolveCategoryIds(contentRepo, 'user-1', 'ws-1', 'incident');
  assert.deepEqual(result, ['cat-existing']);
});

test('resolveCategoryIds creates new category when not found', async () => {
  let created = false;
  const contentRepo = {
    findCategoryByName: async () => null,
    createCategory: async (userId, wsId, data) => {
      assert.equal(userId, 'user-1');
      assert.equal(wsId, 'ws-1');
      assert.equal(data.name, 'decision');
      created = true;
      return { id: 'cat-new' };
    },
  };

  const result = await resolveCategoryIds(contentRepo, 'user-1', 'ws-1', 'decision');
  assert.deepEqual(result, ['cat-new']);
  assert.ok(created);
});
