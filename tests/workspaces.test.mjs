import test from 'node:test';
import assert from 'node:assert/strict';

import { CreateWorkspaceUseCase } from '../dist/application/use-cases/index.js';
import { createMemoryRepositories } from '../dist/infrastructure/repositories/memory-repositories.js';

test('create workspace persists the workspace and the initial Inbox project', async () => {
  const repositories = createMemoryRepositories();
  const useCase = new CreateWorkspaceUseCase(repositories.contentRepository);

  const result = await useCase.execute({ displayName: 'Acme Team', workspaceSlug: 'Acme Team' }, 'user-1');

  assert.equal(result.ok, true);
  assert.equal(result.workspace.workspaceSlug, 'acme-team');
  assert.equal(result.initialProject.projectSlug, 'inbox');
  assert.deepEqual((await repositories.contentRepository.listWorkspaces('user-1')).map((workspace) => workspace.workspaceSlug), ['acme-team']);
  assert.deepEqual((await repositories.contentRepository.listProjects('user-1')).map((project) => project.projectSlug), ['inbox']);
});

test('create workspace rejects a second workspace for the same user in this release', async () => {
  const repositories = createMemoryRepositories();
  const useCase = new CreateWorkspaceUseCase(repositories.contentRepository);

  await useCase.execute({ displayName: 'Acme Team', workspaceSlug: 'acme-team' }, 'user-1');

  await assert.rejects(
    () => useCase.execute({ displayName: 'Other Team', workspaceSlug: 'other-team' }, 'user-1'),
    /workspace_already_exists/,
  );
});
