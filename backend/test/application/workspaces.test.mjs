import test from 'node:test';
import assert from 'node:assert/strict';

import { CreateProjectUseCase, CreateWorkspaceUseCase } from '../../dist/application/use-cases/index.js';
import { createMemoryRepositories } from '../../dist/infrastructure/repositories/memory-repositories.js';

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
    (error) => {
      assert.equal(error.getResponse().code, 'workspace_already_exists');
      assert.deepEqual(error.getResponse().details.fieldErrors, { workspaceSlug: 'Este usuario ja possui um workspace.' });
      return true;
    },
  );
});

test('create project persists metadata, updates workspace slugs and rejects duplicate slug or repo', async () => {
  const repositories = createMemoryRepositories();
  await new CreateWorkspaceUseCase(repositories.contentRepository).execute({ displayName: 'Acme Team', workspaceSlug: 'acme-team' }, 'user-1');
  const useCase = new CreateProjectUseCase(repositories.contentRepository);

  const result = await useCase.execute({
    displayName: 'Acme API',
    projectSlug: 'acme-api',
    repoFullName: 'acme/api',
    aliases: ['api'],
    defaultTags: ['backend'],
  }, 'user-1');

  assert.equal(result.ok, true);
  assert.equal(result.project.projectSlug, 'acme-api');
  assert.deepEqual(result.workspace.projectSlugs, ['inbox', 'acme-api']);

  await assert.rejects(
    () => useCase.execute({ displayName: 'Other API', projectSlug: 'acme-api', repoFullName: 'acme/other', aliases: [], defaultTags: [] }, 'user-1'),
    (error) => {
      assert.equal(error.getResponse().code, 'project_slug_already_exists');
      assert.deepEqual(error.getResponse().details.fieldErrors, { projectSlug: 'Este slug de projeto ja existe.' });
      return true;
    },
  );
  await assert.rejects(
    () => useCase.execute({ displayName: 'Duplicate Repo', projectSlug: 'duplicate-repo', repoFullName: 'ACME/API', aliases: [], defaultTags: [] }, 'user-1'),
    (error) => {
      assert.equal(error.getResponse().code, 'project_repo_already_mapped');
      assert.deepEqual(error.getResponse().details.fieldErrors, { repoFullName: 'Este repositorio ja esta vinculado a outro projeto.' });
      return true;
    },
  );
});
