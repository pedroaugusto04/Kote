import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';

import { decryptConfig, encryptConfig } from '../../dist/application/credentials.js';
import { GithubRepositoryResolutionService } from '../../dist/application/services/github-repository-resolution.service.js';
import { CreateProjectUseCase, CreateWorkspaceUseCase } from '../../dist/application/use-cases/index.js';
import { createPostgresTestRepositories } from '../helpers/postgres-test-repositories.mjs';

function runtimeEnvironmentProvider() {
  return {
    read: () => ({
      credentialsEncryptionKey: process.env.KB_CREDENTIALS_ENCRYPTION_KEY || '',
      githubAppId: process.env.KB_GITHUB_APP_ID || '',
      githubAppPrivateKey: process.env.KB_GITHUB_APP_PRIVATE_KEY || '',
      reviewAiProvider: process.env.KB_REVIEW_AI_PROVIDER || 'none',
      conversationAiProvider: process.env.KB_CONVERSATION_AI_PROVIDER || 'none',
    }),
  };
}

function githubIntegrationGateway() {
  return {
    async fetchInstallationRepositories() {
      const response = await fetch('https://api.github.com/installation/repositories?per_page=100');
      if (!response.ok) return [];
      const payload = await response.json();
      return (payload.repositories || []).map((repo) => ({
        id: Number(repo.id || 0),
        fullName: String(repo.full_name || '').trim(),
        name: String(repo.name || '').trim(),
        owner: String(repo.owner?.login || '').trim(),
        private: Boolean(repo.private),
        htmlUrl: String(repo.html_url || '').trim(),
        description: repo.description == null ? null : String(repo.description),
        defaultBranch: repo.default_branch == null ? null : String(repo.default_branch),
      }));
    },
  };
}

test('create workspace persists the workspace and the initial Inbox project', async (t) => {
  process.env.KB_CREDENTIALS_ENCRYPTION_KEY = crypto.randomBytes(32).toString('base64');
  process.env.KB_REVIEW_AI_PROVIDER = 'openrouter';
  process.env.KB_CONVERSATION_AI_PROVIDER = 'openai';
  const repositories = await createPostgresTestRepositories(t);
  const user = await repositories.createTestUser();
  const useCase = new CreateWorkspaceUseCase(
    repositories.contentRepository,
    repositories.credentialRepository,
    repositories.runtimeEnvironmentProvider,
  );

  const result = await useCase.execute({ displayName: 'Acme Team', workspaceSlug: 'Acme Team' }, user.id);

  assert.equal(result.ok, true);
  assert.equal(result.workspace.workspaceSlug, 'acme-team');
  assert.equal(result.initialProject.projectSlug, 'inbox');
  assert.deepEqual((await repositories.contentRepository.listWorkspaces(user.id)).map((workspace) => workspace.workspaceSlug), ['acme-team']);
  assert.deepEqual((await repositories.contentRepository.listProjects(user.id)).map((project) => project.projectSlug), ['inbox']);
  const credentials = await repositories.credentialRepository.listCredentials(user.id, 'acme-team');
  assert.deepEqual(credentials.map((credential) => credential.provider).sort(), ['ai-conversation', 'ai-review']);
  assert.equal(credentials.every((credential) => credential.status === 'connected' && credential.revokedAt === null), true);
  assert.deepEqual(
    credentials
      .map((credential) => ({
        provider: credential.provider,
        connectedAccount: credential.publicMetadata.connectedAccount,
        enabled: decryptConfig(credential.encryptedConfig, repositories.runtimeEnvironmentProvider).enabled,
      }))
      .sort((left, right) => left.provider.localeCompare(right.provider)),
    [
      { provider: 'ai-conversation', connectedAccount: 'openai', enabled: true },
      { provider: 'ai-review', connectedAccount: 'openrouter', enabled: true },
    ],
  );
});

test('create workspace rejects a second workspace for the same user in this release', async (t) => {
  process.env.KB_CREDENTIALS_ENCRYPTION_KEY = crypto.randomBytes(32).toString('base64');
  const repositories = await createPostgresTestRepositories(t);
  const user = await repositories.createTestUser();
  const useCase = new CreateWorkspaceUseCase(
    repositories.contentRepository,
    repositories.credentialRepository,
    repositories.runtimeEnvironmentProvider,
  );

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
  process.env.KB_CREDENTIALS_ENCRYPTION_KEY = crypto.randomBytes(32).toString('base64');
  const repositories = await createPostgresTestRepositories(t);
  const user = await repositories.createTestUser();
  await new CreateWorkspaceUseCase(
    repositories.contentRepository,
    repositories.credentialRepository,
    repositories.runtimeEnvironmentProvider,
  ).execute({ displayName: 'Acme Team', workspaceSlug: 'acme-team' }, user.id);
  const githubRepositoryResolution = new GithubRepositoryResolutionService(
    repositories.contentRepository,
    repositories.credentialRepository,
    runtimeEnvironmentProvider(),
    githubIntegrationGateway(),
  );
  const useCase = new CreateProjectUseCase(repositories.contentRepository, githubRepositoryResolution);
  await repositories.credentialRepository.upsertCredential({
    userId: user.id,
    workspaceSlug: 'acme-team',
    provider: 'github-app',
    status: 'connected',
    encryptedConfig: encryptConfig({ installationId: '42', accountLogin: 'acme' }, repositories.runtimeEnvironmentProvider),
    publicMetadata: { connectedAccount: 'acme' },
  });
  const originalFetch = globalThis.fetch;
  const originalAppId = process.env.KB_GITHUB_APP_ID;
  const originalPrivateKey = process.env.KB_GITHUB_APP_PRIVATE_KEY;
  process.env.KB_GITHUB_APP_ID = 'app-id';
  process.env.KB_GITHUB_APP_PRIVATE_KEY = '-----BEGIN PRIVATE KEY-----\\nMIIBVAIBADANBgkqhkiG9w0BAQEFAASCAT4wggE6AgEAAkEA4dPaANJrsQts5dPc\\n3bWKP9Cp2rzAKQm+zsBRyEM9CWippQOzuaLbv9eE3/5zm8HtPtPHsJW8jrdzdLIZ\\nNVJ/3wIDAQABAkANtRhEeIFE69aeVK/RXVWY7geBWXeohgjo78+HAl3QFkcLy0G7\\nd8yRE6NyoSzgNKhUapCIIgXIdg5zm0+HYz4xAiEA/O/BAkqlqna0Naou6pjryLIv\\nCkk9ET2ztq5xucIo840CIQDkkAthErxSTqi+6VFu7Fe3l+mJnkTahWi24CMVROgQ\\nGwIhAMY3oXsJQsDO27T+lFvW0Vhrgv+9m3TKdO7h0E/xv6P1AiAqwPMP9nQ5pTMV\\newlbiWQjGIx7zJoukhPzWVvWp6wNDwIge5mo6tY09C+IjQR23ibEDwYwxVTymK4s\\nUgCovTDoi6o=\\n-----END PRIVATE KEY-----';
  globalThis.fetch = async (url) => {
    const target = String(url);
    if (target.includes('/access_tokens')) return Response.json({ token: 'installation-token' });
    if (target.includes('/installation/repositories')) {
      return Response.json({
        repositories: [
          { id: 101, full_name: 'acme/api', name: 'api', private: true, html_url: 'https://github.com/acme/api', default_branch: 'main', owner: { login: 'acme' } },
        ],
      });
    }
    return new Response(null, { status: 404 });
  };

  const result = await useCase.execute({
    displayName: 'Acme API',
    projectSlug: 'acme-api',
    repositoryIds: ['101'],
    defaultTags: ['backend'],
  }, user.id);

  assert.equal(result.ok, true);
  assert.equal(result.project.projectSlug, 'acme-api');
  assert.equal(result.project.repositories[0].fullName, 'acme/api');

  await assert.rejects(
    () => useCase.execute({ displayName: 'Other API', projectSlug: 'acme-api', repositoryIds: [], defaultTags: [] }, user.id),
    (error) => {
      assert.equal(error.getResponse().code, 'project_slug_already_exists');
      assert.deepEqual(error.getResponse().details.fieldErrors, { projectSlug: 'Este slug de projeto ja existe.' });
      return true;
    },
  );

  globalThis.fetch = originalFetch;
  process.env.KB_GITHUB_APP_ID = originalAppId;
  process.env.KB_GITHUB_APP_PRIVATE_KEY = originalPrivateKey;
});
