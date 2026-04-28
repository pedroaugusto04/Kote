import test from 'node:test';
import assert from 'node:assert/strict';

import { createMemoryRepositories } from '../dist/infrastructure/repositories/memory-repositories.js';
import { RunOnboardingUseCase } from '../dist/application/use-cases/index.js';

test('onboarding upserts workspace and projects in content repository', async () => {
  const repositories = createMemoryRepositories();
  const result = await new RunOnboardingUseCase(repositories.contentRepository).execute(
    {
      operation: 'upsert',
      workspaceSlug: 'acme-team',
      displayName: 'Acme Team',
      whatsappGroupJid: '120363000000000@g.us',
      githubRepos: ['acme/api'],
      projects: [
        {
          projectSlug: 'acme-api',
          displayName: 'Acme API',
          repoFullName: 'acme/api',
          aliases: ['api'],
          defaultTags: ['backend'],
        },
      ],
    },
    'user-1',
  );

  assert.equal(result.ok, true);
  assert.deepEqual(result.workspaces.map((workspace) => workspace.workspaceSlug), ['acme-team']);
  assert.deepEqual(result.projects.map((project) => project.projectSlug), ['acme-api']);
  assert.equal(result.links.queryReady, true);
});
