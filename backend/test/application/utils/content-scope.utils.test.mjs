import test from 'node:test';
import assert from 'node:assert/strict';

import {
  resolveContentScopeFromSlugs,
  resolveWorkspaceIdFromSlug,
} from '../../../dist/application/utils/content/content-scope.utils.js';

function createRepository(overrides = {}) {
  return {
    async getProjectBySlug(_userId, projectSlug) {
      if (projectSlug === 'platform') {
        return {
          id: 'project-1',
          projectSlug: 'platform',
          workspaceId: 'workspace-1',
          workspaceSlug: 'default',
          enabled: true,
        };
      }
      return null;
    },
    async getWorkspaceBySlug(_userId, workspaceSlug) {
      if (workspaceSlug === 'default') {
        return {
          id: 'workspace-1',
          workspaceSlug: 'default',
          displayName: 'Default',
        };
      }
      return null;
    },
    ...overrides,
  };
}

test('resolveContentScopeFromSlugs prefers project slug and derives workspaceId from project', async () => {
  const repository = createRepository();
  const scope = await resolveContentScopeFromSlugs(repository, 'user-1', {
    projectSlug: 'platform',
    workspaceSlug: 'other-workspace',
  });

  assert.equal(scope.projectId, 'project-1');
  assert.equal(scope.workspaceId, 'workspace-1');
  assert.equal(scope.project?.projectSlug, 'platform');
  assert.equal(scope.workspace, null);
});

test('resolveContentScopeFromSlugs resolves workspace slug when project slug is absent', async () => {
  const repository = createRepository();
  const scope = await resolveContentScopeFromSlugs(repository, 'user-1', {
    workspaceSlug: 'default',
  });

  assert.equal(scope.projectId, null);
  assert.equal(scope.workspaceId, 'workspace-1');
  assert.equal(scope.workspace?.workspaceSlug, 'default');
  assert.equal(scope.project, null);
});

test('resolveContentScopeFromSlugs returns empty scope for unknown slugs', async () => {
  const repository = createRepository();
  const scope = await resolveContentScopeFromSlugs(repository, 'user-1', {
    projectSlug: 'missing',
  });

  assert.equal(scope.projectId, null);
  assert.equal(scope.workspaceId, null);
  assert.equal(scope.project, null);
  assert.equal(scope.workspace, null);
});

test('resolveWorkspaceIdFromSlug returns workspace id helper result', async () => {
  const repository = createRepository();
  const workspaceId = await resolveWorkspaceIdFromSlug(repository, 'user-1', 'default');
  assert.equal(workspaceId, 'workspace-1');
});
