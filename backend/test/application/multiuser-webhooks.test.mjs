import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';

import { BuildDashboardUseCase, CreateWorkspaceUseCase, HandleGithubPushUseCase, IngestEntryUseCase, RefreshReminderStatusesUseCase } from '../../dist/application/use-cases/index.js';
import { createPostgresTestRepositories } from '../helpers/postgres-test-repositories.mjs';

function configureEnv() {
  process.env.KB_GITHUB_APP_WEBHOOK_SECRET = 'github-webhook-secret';
  process.env.KB_REVIEW_AI_PROVIDER = 'none';
}

function canonicalPayload(projectSlug = 'acme-api') {
  return {
    source: {
      channel: 'external',
      system: 'test',
      actor: 'tester',
      conversationId: 'conversation-1',
      correlationId: `event:${projectSlug}:1`,
    },
    event: {
      type: 'generic_record',
      occurredAt: '2026-04-27T12:00:00.000Z',
      projectSlug,
    },
    content: {
      rawText: 'Registro inicial do projeto.',
      title: 'Registro inicial',
      attachments: [],
      sections: {
        summary: 'Resumo do registro.',
        impact: '',
        risks: [],
        nextSteps: [],
        reviewFindings: [],
      },
    },
    classification: {
      kind: 'note',
      canonicalType: 'event',
      importance: 'medium',
      status: 'active',
      tags: ['setup'],
      decisionFlag: false,
    },
    actions: {
      reminderDate: '',
      reminderTime: '',
      followUpBy: '',
    },
    metadata: {},
  };
}

function githubBody(installationId = 42) {
  return {
    ref: 'refs/heads/main',
    before: '1111111',
    after: '2222222',
    installation: { id: installationId },
    repository: { full_name: 'acme/api', name: 'api', html_url: 'https://github.com/acme/api' },
    pusher: { name: 'pedro' },
    head_commit: {
      message: 'fix webhook',
      timestamp: '2026-04-27T12:00:00.000Z',
      url: 'https://github.com/acme/api/commit/2222222',
    },
    commits: [{ id: '2222222', message: 'fix webhook', added: [], modified: ['src/app.ts'], removed: [] }],
  };
}

function signedGithubInput(body) {
  const rawBody = JSON.stringify(body);
  const signature = `sha256=${crypto.createHmac('sha256', process.env.KB_GITHUB_APP_WEBHOOK_SECRET).update(rawBody).digest('hex')}`;
  return {
    headers: {
      'x-hub-signature-256': signature,
      'x-github-event': 'push',
    },
    body,
    rawBody,
  };
}

const githubGateway = {
  verifyWebhookSignature() {},
  async fetchInstallationToken() {
    return 'github-token';
  },
  async fetchComparePayload() {
    return { commits: [], files: [] };
  },
};

const reviewGateway = {
  async generate() {
    return {
      summary: 'Resumo do push.',
      impact: '',
      risks: [],
      nextSteps: [],
      reviewFindings: [],
    };
  },
};

test('new users start with an empty scoped dashboard and cannot see another user notes', async (t) => {
  configureEnv();
  const repositories = await createPostgresTestRepositories(t);
  const ingest = new IngestEntryUseCase(repositories.contentRepository, repositories.runtimeEnvironmentProvider);
  const dashboard = new BuildDashboardUseCase(
    repositories.contentRepository,
    repositories.contentQueryRepository,
    new RefreshReminderStatusesUseCase(
      repositories.contentRepository,
      repositories.reminderDispatchRepository,
      repositories.runtimeEnvironmentProvider,
    ),
  );
  const userA = await repositories.userRepository.createUser({ email: 'a@example.com', displayName: 'A', passwordHash: 'hash', role: 'user' });
  const userB = await repositories.userRepository.createUser({ email: 'b@example.com', displayName: 'B', passwordHash: 'hash', role: 'user' });
  await repositories.contentRepository.upsertWorkspace(userA.id, {
    workspaceSlug: 'default',
    displayName: 'Default',
    whatsappChatJid: '',
    telegramChatId: '',
    githubRepos: [],
    projectSlugs: ['inbox'],
    createdAt: '2026-04-27T00:00:00.000Z',
    updatedAt: '2026-04-27T00:00:00.000Z',
  });

  const emptyDashboard = await dashboard.execute(userB.id);
  assert.deepEqual(emptyDashboard.workspaces, []);
  assert.deepEqual(emptyDashboard.projects, []);
  assert.equal(emptyDashboard.home.metrics.every((metric) => metric.value === 0), true);

  await ingest.execute(canonicalPayload('acme-api'), userA.id, 'default');

  const dashboardA = await dashboard.execute(userA.id);
  const dashboardB = await dashboard.execute(userB.id);
  assert.equal(dashboardA.projects[0].projectSlug, 'acme-api');
  assert.equal(dashboardB.projects.length, 0);
  assert.equal(dashboardB.home.metrics.every((metric) => metric.value === 0), true);
});

test('github app webhook resolves user by installation id and rejects unknown identities', async (t) => {
  configureEnv();
  const repositories = await createPostgresTestRepositories(t);
  const user = await repositories.userRepository.createUser({ email: 'owner@example.com', displayName: 'Owner', passwordHash: 'hash', role: 'user' });
  await new CreateWorkspaceUseCase(
    repositories.contentRepository,
    repositories.credentialRepository,
    repositories.runtimeEnvironmentProvider,
  ).execute({
    displayName: 'Default',
    workspaceSlug: 'default',
  }, user.id);
  const ingest = new IngestEntryUseCase(repositories.contentRepository, repositories.runtimeEnvironmentProvider);
  const handler = new HandleGithubPushUseCase(
    ingest,
    repositories.externalIdentityRepository,
    repositories.webhookEventRepository,
    repositories.runtimeEnvironmentProvider,
    githubGateway,
    reviewGateway,
    repositories.contentRepository,
  );

  await assert.rejects(() => handler.execute(signedGithubInput(githubBody(404))), /identity_not_found/);
  assert.equal((await repositories.contentRepository.listNotes(user.id)).length, 0);

  await repositories.externalIdentityRepository.upsertExternalIdentity({
    userId: user.id,
    workspaceSlug: 'default',
    provider: 'github-app',
    identityType: 'installation_id',
    externalId: '42',
    publicMetadata: {},
  });

  const result = await handler.execute(signedGithubInput(githubBody(42)));
  assert.equal(result.ok, true);
  const notes = await repositories.contentRepository.listNotes(user.id);
  assert.equal(notes.length, 1);
  assert.equal(notes[0].sourceChannel, 'github-push');
  assert.equal(notes[0].projectSlug, 'inbox');
  assert.equal(notes[0].metadata.repoFullName, 'acme/api');
  assert.equal(notes[0].metadata.headSha, '2222222');
  assert.deepEqual(notes[0].metadata.changedFiles, ['src/app.ts']);
  const projects = await repositories.contentRepository.listProjects(user.id);
  assert.equal(projects.find((project) => project.projectSlug === 'inbox')?.repositories.length, 0);
});

test('github push resolves project by explicit repository mapping', async (t) => {
  configureEnv();
  const repositories = await createPostgresTestRepositories(t);
  const user = await repositories.userRepository.createUser({ email: 'mapped@example.com', displayName: 'Mapped', passwordHash: 'hash', role: 'user' });
  await repositories.contentRepository.upsertWorkspace(user.id, {
    workspaceSlug: 'default',
    displayName: 'Default',
    whatsappChatJid: '',
    telegramChatId: '',
    githubRepos: ['acme/api'],
    projectSlugs: ['inbox', 'platform'],
    createdAt: '2026-04-27T00:00:00.000Z',
    updatedAt: '2026-04-27T00:00:00.000Z',
  });
  const repo = await repositories.contentRepository.upsertRepository({
    workspaceSlug: 'default',
    externalId: '0',
    fullName: 'acme/api',
    htmlUrl: 'https://github.com/acme/api',
    description: null,
    defaultBranch: null,
  });
  await repositories.contentRepository.upsertProject(user.id, {
    projectSlug: 'platform',
    displayName: 'Platform',
    repositories: [repo],
    workspaceSlug: 'default',
    defaultTags: ['backend'],
    enabled: true,
  });
  await repositories.externalIdentityRepository.upsertExternalIdentity({
    userId: user.id,
    workspaceSlug: 'default',
    provider: 'github-app',
    identityType: 'installation_id',
    externalId: '42',
    publicMetadata: {},
  });
  const ingest = new IngestEntryUseCase(repositories.contentRepository, repositories.runtimeEnvironmentProvider);
  const handler = new HandleGithubPushUseCase(
    ingest,
    repositories.externalIdentityRepository,
    repositories.webhookEventRepository,
    repositories.runtimeEnvironmentProvider,
    githubGateway,
    reviewGateway,
    repositories.contentRepository,
  );

  const result = await handler.execute(signedGithubInput(githubBody(42)));

  assert.equal(result.payload.event.projectSlug, 'platform');
  assert.equal(result.ingestResult.project, 'platform');
  const notes = await repositories.contentRepository.listNotes(user.id);
  assert.equal(notes[0].projectSlug, 'platform');
  assert.equal(notes[0].metadata.repoFullName, 'acme/api');
  assert.equal(notes[0].metadata.headSha, '2222222');
  assert.deepEqual(notes[0].metadata.changedFiles, ['src/app.ts']);
});
