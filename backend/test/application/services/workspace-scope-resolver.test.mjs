import test from 'node:test';
import assert from 'node:assert/strict';

import { WorkspaceScopeResolver, SCOPE_ERROR_MESSAGES, SCOPE_SPECIAL_PROJECT } from '../../../dist/application/services/content/workspace-scope-resolver.service.js';

function createMockRepo({ workspaces = [], projects = [] } = {}) {
  return {
    async getWorkspaceBySlug(userId, slug) {
      return workspaces.find((w) => w.userId === userId && w.workspaceSlug === slug) || null;
    },
    async getProjectBySlug(userId, slug) {
      return projects.find((p) => p.userId === userId && p.projectSlug === slug) || null;
    },
  };
}

test('WorkspaceScopeResolver resolves scope from projectSlug', async () => {
  const repo = createMockRepo({
    projects: [
      { id: 'proj-1', userId: 'user-1', projectSlug: 'backend', workspaceId: 'ws-1', workspaceSlug: 'corp', enabled: true },
    ],
  });
  const resolver = new WorkspaceScopeResolver(repo);

  const scope = await resolver.resolve('user-1', { projectSlug: 'backend' });

  assert.equal(scope.userId, 'user-1');
  assert.equal(scope.projectId, 'proj-1');
  assert.equal(scope.projectSlug, 'backend');
  assert.equal(scope.workspaceId, 'ws-1');
  assert.equal(scope.workspaceSlug, 'corp');
});

test('WorkspaceScopeResolver throws 404 when project not found or disabled', async () => {
  const repo = createMockRepo({
    projects: [
      { id: 'proj-2', userId: 'user-1', projectSlug: 'disabled-proj', workspaceId: 'ws-1', enabled: false },
    ],
  });
  const resolver = new WorkspaceScopeResolver(repo);

  await assert.rejects(
    async () => resolver.resolve('user-1', { projectSlug: 'disabled-proj' }),
    (err) => {
      assert.equal(err.message, SCOPE_ERROR_MESSAGES.PROJECT_NOT_FOUND);
      return true;
    },
  );

  await assert.rejects(
    async () => resolver.resolve('user-1', { projectSlug: 'non-existent' }),
    (err) => {
      assert.equal(err.message, SCOPE_ERROR_MESSAGES.PROJECT_NOT_FOUND);
      return true;
    },
  );
});

test('WorkspaceScopeResolver resolves workspaceSlug when projectSlug is not passed', async () => {
  const repo = createMockRepo({
    workspaces: [
      { id: 'ws-10', userId: 'user-1', workspaceSlug: 'team-a' },
    ],
  });
  const resolver = new WorkspaceScopeResolver(repo);

  const scope = await resolver.resolve('user-1', { workspaceSlug: 'team-a' });

  assert.equal(scope.userId, 'user-1');
  assert.equal(scope.workspaceId, 'ws-10');
  assert.equal(scope.workspaceSlug, 'team-a');
  assert.equal(scope.projectId, null);
  assert.equal(scope.projectSlug, null);
});

test('WorkspaceScopeResolver throws 404 if workspaceSlug is missing and no projectSlug', async () => {
  const repo = createMockRepo();
  const resolver = new WorkspaceScopeResolver(repo);

  await assert.rejects(
    async () => resolver.resolve('user-1', {}),
    (err) => {
      assert.equal(err.message, SCOPE_ERROR_MESSAGES.WORKSPACE_SLUG_MISSING);
      return true;
    },
  );
});

test('WorkspaceScopeResolver throws 404 if workspaceSlug not found in database', async () => {
  const repo = createMockRepo();
  const resolver = new WorkspaceScopeResolver(repo);

  await assert.rejects(
    async () => resolver.resolve('user-1', { workspaceSlug: 'missing-ws' }),
    (err) => {
      assert.equal(err.message, SCOPE_ERROR_MESSAGES.WORKSPACE_NOT_FOUND);
      return true;
    },
  );
});

test('WorkspaceScopeResolver handles "all" project slug when allowAllProjects is true', async () => {
  const repo = createMockRepo({
    workspaces: [
      { id: 'ws-20', userId: 'user-1', workspaceSlug: 'global-ws' },
    ],
  });
  const resolver = new WorkspaceScopeResolver(repo);

  const scope = await resolver.resolve('user-1', {
    projectSlug: SCOPE_SPECIAL_PROJECT.ALL,
    workspaceSlug: 'global-ws',
    allowAllProjects: true,
  });

  assert.equal(scope.projectId, 'all');
  assert.equal(scope.projectSlug, 'all');
  assert.equal(scope.workspaceId, 'ws-20');
  assert.equal(scope.workspaceSlug, 'global-ws');
});
