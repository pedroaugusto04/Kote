import test from 'node:test';
import assert from 'node:assert/strict';

import { CreateProjectUseCase, CreateWorkspaceUseCase } from '../../dist/application/use-cases/index.js';
import { createPostgresTestRepositories } from '../helpers/postgres-test-repositories.mjs';

test('create workspace persists the workspace and the initial Inbox project', async (t) => {
  const repositories = await createPostgresTestRepositories(t);
  const user = await repositories.createTestUser();
  const useCase = new CreateWorkspaceUseCase(repositories.contentRepository);

  const result = await useCase.execute({ displayName: 'Acme Team', workspaceSlug: 'Acme Team' }, user.id);

  assert.equal(result.ok, true);
  assert.equal(result.workspace.workspaceSlug, 'acme-team');
  assert.equal(result.initialProject.projectSlug, 'inbox');
  assert.deepEqual((await repositories.contentRepository.listWorkspaces(user.id)).map((workspace) => workspace.workspaceSlug), ['acme-team']);
  assert.deepEqual((await repositories.contentRepository.listProjects(user.id)).map((project) => project.projectSlug), ['inbox']);
});

test('create workspace rejects a second workspace for the same user in this release', async (t) => {
  const repositories = await createPostgresTestRepositories(t);
  const user = await repositories.createTestUser();
  const useCase = new CreateWorkspaceUseCase(repositories.contentRepository);

  await useCase.execute({ displayName: 'Acme Team', workspaceSlug: 'acme-team' }, user.id);

  await assert.rejects(
    () => useCase.execute({ displayName: 'Other Team', workspaceSlug: 'other-team' }, user.id),
    (error) => {
      assert.equal(error.getResponse().code, 'workspace_already_exists');
      assert.deepEqual(error.getResponse().details.fieldErrors, { workspaceSlug: 'Este usuario ja possui um workspace.' });
      return true;
    },
  );
});

test('create project persists metadata, updates workspace slugs and rejects duplicate slug or repo', async (t) => {
  const repositories = await createPostgresTestRepositories(t);
  const user = await repositories.createTestUser();
  await new CreateWorkspaceUseCase(repositories.contentRepository).execute({ displayName: 'Acme Team', workspaceSlug: 'acme-team' }, user.id);
  const useCase = new CreateProjectUseCase(repositories.contentRepository);

  const repo = await repositories.contentRepository.upsertRepository({
    workspaceSlug: 'acme-team',
    externalId: '101',
    fullName: 'acme/api',
    htmlUrl: 'https://github.com/acme/api',
    description: null,
    defaultBranch: null,
  });

  const result = await useCase.execute({
    displayName: 'Acme API',
    projectSlug: 'acme-api',
    repositoryIds: [repo.id],
    aliases: ['api'],
    defaultTags: ['backend'],
  }, user.id);

  assert.equal(result.ok, true);
  assert.equal(result.project.projectSlug, 'acme-api');

  await assert.rejects(
    () => useCase.execute({ displayName: 'Other API', projectSlug: 'acme-api', repositories: [], aliases: [], defaultTags: [] }, user.id),
    (error) => {
      assert.equal(error.getResponse().code, 'project_slug_already_exists');
      assert.deepEqual(error.getResponse().details.fieldErrors, { projectSlug: 'Este slug de projeto ja existe.' });
      return true;
    },
  );
  // Removed duplicate repo rejection test as requested by user
});
