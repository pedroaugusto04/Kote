import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';

import { ProcessGithubPushService } from '../../../dist/application/services/integrations/process-github-push.service.js';
import { GithubRepositoryResolutionService } from '../../../dist/application/services/integrations/github-repository-resolution.service.js';
import { BuildDashboardUseCase, CreateWorkspaceUseCase, HandleGithubPushUseCase, HandleGithubPullRequestUseCase, IngestEntryUseCase, RefreshReminderStatusesUseCase } from '../../../dist/application/use-cases/index.js';
import { createPostgresTestRepositories } from '../../helpers/postgres-test-repositories.mjs';

function configureEnv() {
  process.env.KB_CREDENTIALS_ENCRYPTION_KEY = crypto.randomBytes(32).toString('base64');
  process.env.KB_GITHUB_APP_WEBHOOK_SECRET = 'github-webhook-secret';
  process.env.KB_REVIEW_AI_PROVIDER = 'none';
  process.env.KB_CONVERSATION_AI_PROVIDER = 'none';
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
    compare: 'https://github.com/acme/api/compare/1111111...2222222',
    repository: { id: 101, full_name: 'acme/api', name: 'api', private: true, html_url: 'https://github.com/acme/api' },
    pusher: { name: 'pedro' },
    sender: { login: 'octocat' },
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
  verifyWebhookSignature() { },
  async fetchInstallationToken() {
    return 'github-token';
  },
  async fetchComparePayload() {
    return { commits: [], files: [{ filename: 'src/app.ts', status: 'modified', patch: '' }] };
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
  const loggerMock = { info() {}, warn() {}, error() {}, debug() {} };
  const ingest = new IngestEntryUseCase(repositories.contentRepository, repositories.runtimeEnvironmentProvider, repositories.noteLifecycleService, loggerMock, repositories.database);
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
    { checkQuota: async () => ({ allowed: true, limit: -1, current: 0 }) },
  ).execute({
    displayName: 'Default',
    workspaceSlug: 'default',
  }, user.id);
  const loggerMock = { info() {}, warn() {}, error() {}, debug() {} };
  const ingest = new IngestEntryUseCase(repositories.contentRepository, repositories.runtimeEnvironmentProvider, repositories.noteLifecycleService, loggerMock, repositories.database);
  const processGithubPushService = new ProcessGithubPushService(
    ingest,
    repositories.runtimeEnvironmentProvider,
    githubGateway,
    reviewGateway,
    repositories.quotaService,
    repositories.contentRepository,
  );
  const unusedGithubGateway = {
    verifyWebhookSignature() { },
    async fetchInstallationToken() {
      throw new Error('installation token should not be fetched for unselected repositories');
    },
    async fetchComparePayload() {
      throw new Error('compare payload should not be fetched for unselected repositories');
    },
  };
  const unusedReviewGateway = {
    async generate() {
      throw new Error('review analysis should not run for unselected repositories');
    },
  };
  const githubRepositoryResolution = new GithubRepositoryResolutionService(
    repositories.contentRepository,
    repositories.credentialRepository,
    repositories.runtimeEnvironmentProvider,
    unusedGithubGateway,
  );
  const handler = new HandleGithubPushUseCase(
    processGithubPushService,
    repositories.externalIdentityRepository,
    repositories.webhookEventRepository,
    repositories.runtimeEnvironmentProvider,
    unusedGithubGateway,
    githubRepositoryResolution,
  );

  await assert.rejects(() => handler.execute(signedGithubInput(githubBody(404)), { synchronous: true }), /identity_not_found/);
  assert.equal((await repositories.contentRepository.listNotes(user.id)).length, 0);

  await repositories.externalIdentityRepository.upsertExternalIdentity({
    userId: user.id,
    workspaceSlug: 'default',
    provider: 'github-app',
    identityType: 'installation_id',
    externalId: '42',
    publicMetadata: {},
  });

  const result = await handler.execute(signedGithubInput(githubBody(42)), { synchronous: true });
  assert.equal(result.ok, true);
  assert.equal(result.processed, false);
  assert.equal(result.ignored, 'github_repository_not_selected');
  const notes = await repositories.contentRepository.listNotes(user.id);
  assert.equal(notes.length, 0);
  const projects = await repositories.contentRepository.listProjects(user.id);
  assert.equal(projects.find((project) => project.projectSlug === 'inbox')?.repositories.length, 0);
  const event = await repositories.getLastWebhookEvent();
  assert.equal(event.status, 'ignored');
  assert.equal(event.error, 'github_repository_not_selected');
  assert.deepEqual(event.rawPayload, {
    installationId: '42',
    repositoryId: '101',
    repositoryFullName: 'acme/api',
    repositoryPrivate: true,
    ref: 'refs/heads/main',
    before: '1111111',
    after: '2222222',
    deleted: false,
    pusherName: 'pedro',
    senderLogin: 'octocat',
  });
  assert.equal(JSON.stringify(event.rawPayload).includes('fix webhook'), false);
  assert.equal(JSON.stringify(event.rawPayload).includes('src/app.ts'), false);
  assert.equal(JSON.stringify(event.rawPayload).includes('compare'), false);
});

test('github push resolves project by explicit repository mapping', async (t) => {
  configureEnv();
  const repositories = await createPostgresTestRepositories(t);
  const user = await repositories.userRepository.createUser({ email: 'mapped@example.com', displayName: 'Mapped', passwordHash: 'hash', role: 'user' });
  const workspace = await repositories.contentRepository.upsertWorkspace(user.id, {
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
    workspaceId: workspace.id,
    workspaceSlug: 'default',
    externalId: '101',
    fullName: 'acme/api',
    htmlUrl: 'https://github.com/acme/api',
    description: null,
    defaultBranch: null,
  });
  await repositories.contentRepository.upsertProject(user.id, {
    workspaceId: workspace.id,
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
  const loggerMock = { info() {}, warn() {}, error() {}, debug() {} };
  const ingest = new IngestEntryUseCase(repositories.contentRepository, repositories.runtimeEnvironmentProvider, repositories.noteLifecycleService, loggerMock, repositories.database);
  const processGithubPushService = new ProcessGithubPushService(
    ingest,
    repositories.runtimeEnvironmentProvider,
    githubGateway,
    reviewGateway,
    repositories.quotaService,
    repositories.contentRepository,
  );
  const githubRepositoryResolution = new GithubRepositoryResolutionService(
    repositories.contentRepository,
    repositories.credentialRepository,
    repositories.runtimeEnvironmentProvider,
    githubGateway,
  );
  const handler = new HandleGithubPushUseCase(
    processGithubPushService,
    repositories.externalIdentityRepository,
    repositories.webhookEventRepository,
    repositories.runtimeEnvironmentProvider,
    githubGateway,
    githubRepositoryResolution,
  );

  const result = await handler.execute(signedGithubInput(githubBody(42)), { synchronous: true });

  assert.equal(result.ok, true);
  assert.equal(result.ingestResult.noteId.length > 0, true);
  const notes = await repositories.contentRepository.listNotes(user.id);
  assert.equal(notes[0].projectSlug, 'platform');
  assert.equal(notes[0].metadata.repoFullName, 'acme/api');
  assert.equal(notes[0].metadata.headSha, '2222222');
  const linksResult = await repositories.query(
    "select target from kb_note_links where note_id = $1 and metadata->>'source' = 'links'",
    [notes[0].id]
  );
  const targets = linksResult.rows.map(r => r.target);
  assert.deepEqual(targets, ['src/app.ts']);
  const event = await repositories.getLastWebhookEvent();
  assert.equal(event.status, 'processed');
  assert.equal(event.rawPayload.repositoryFullName, 'acme/api');
  assert.equal(event.rawPayload.repositoryPrivate, true);
  assert.equal(JSON.stringify(event.rawPayload).includes('fix webhook'), false);
  assert.equal(JSON.stringify(event.rawPayload).includes('src/app.ts'), false);
  assert.equal(JSON.stringify(event.rawPayload).includes('compare'), false);
});

function githubPrBody(action = 'opened', prNumber = 77) {
  return {
    action,
    number: prNumber,
    pull_request: {
      number: prNumber,
      title: 'feat: add pr context ai integration',
      body: 'This PR connects the backend hook to post comments.',
      base: { sha: '1111111' },
      head: { sha: '2222222' },
    },
    installation: { id: 42 },
    repository: { id: 101, full_name: 'acme/api', name: 'api', private: true },
    sender: { login: 'octocat' },
  };
}

function signedGithubPrInput(body) {
  const rawBody = JSON.stringify(body);
  const signature = `sha256=${crypto.createHmac('sha256', process.env.KB_GITHUB_APP_WEBHOOK_SECRET || 'github-webhook-secret').update(rawBody).digest('hex')}`;
  return {
    headers: {
      'x-hub-signature-256': signature,
      'x-github-event': 'pull_request',
    },
    body,
    rawBody,
  };
}

test('github pull request webhook processes event, searches context, and posts comment', async (t) => {
  configureEnv();
  const repositories = await createPostgresTestRepositories(t);
  const user = await repositories.userRepository.createUser({ email: 'pr@example.com', displayName: 'PR User', passwordHash: 'hash', role: 'user' });
  const workspace = await repositories.contentRepository.upsertWorkspace(user.id, {
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
    workspaceId: workspace.id,
    workspaceSlug: 'default',
    externalId: '101',
    fullName: 'acme/api',
    htmlUrl: 'https://github.com/acme/api',
    description: null,
    defaultBranch: null,
  });
  await repositories.contentRepository.upsertProject(user.id, {
    workspaceId: workspace.id,
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

  const embeddingGatewayMock = {
    async generateEmbeddings() {
      return [[0.1, 0.2, 0.3]];
    },
  };

  let createdNoteId = '';

  const noteEmbeddingRepositoryMock = {
    async findSimilar() {
      return [{ noteId: createdNoteId, chunkText: 'Found PR AI architecture context.' }];
    },
  };

  const createdNote = await repositories.contentRepository.upsertNote(user.id, {
    id: '00000000-0000-0000-0000-000000000001',
    workspaceSlug: 'default',
    projectSlug: 'platform',
    title: 'PR AI Architecture',
    path: 'docs/architecture.md',
    content: {
      rawText: 'PR AI architecture details.',
      title: 'PR AI Architecture',
      attachments: [],
      sections: {
        summary: 'PR AI summary',
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
      tags: [],
      decisionFlag: false,
    },
    metadata: {},
    createdAt: '2026-04-27T00:00:00.000Z',
    updatedAt: '2026-04-27T00:00:00.000Z',
  });
  createdNoteId = createdNote.id;

  let prCommentPosted = false;
  let postedBody = '';

  const githubPrGatewayMock = {
    verifyWebhookSignature() {},
    async fetchInstallationToken() {
      return 'github-token';
    },
    async fetchInstallationRepositories() {
      return [{ fullName: 'acme/api' }];
    },
    async fetchComparePayload() {
      return { commits: [], files: [{ filename: 'src/app.ts', status: 'modified', patch: '' }] };
    },
    async fetchPullRequestComments() {
      return [];
    },
    async postPullRequestComment(repoFullName, prNumber, bodyText) {
      prCommentPosted = true;
      postedBody = bodyText;
      return true;
    },
  };

  const answerGenerationGatewayMock = {
    async generatePullRequestComment() {
      return 'Aqui está o contexto relevante para este PR.';
    },
  };

  const githubRepositoryResolution = new GithubRepositoryResolutionService(
    repositories.contentRepository,
    repositories.credentialRepository,
    repositories.runtimeEnvironmentProvider,
    githubPrGatewayMock,
  );
  const handler = new HandleGithubPullRequestUseCase(
    repositories.externalIdentityRepository,
    repositories.webhookEventRepository,
    repositories.runtimeEnvironmentProvider,
    githubPrGatewayMock,
    embeddingGatewayMock,
    noteEmbeddingRepositoryMock,
    answerGenerationGatewayMock,
    repositories.quotaService,
    null,
    null,
    githubRepositoryResolution,
    repositories.contentRepository,
    repositories.credentialRepository,
  );

  const result = await handler.execute(signedGithubPrInput(githubPrBody('opened', 77)), { synchronous: true });

  assert.equal(result.ok, true);
  assert.equal(result.processed, true);
  assert.equal(result.commentPosted, true);
  assert.equal(prCommentPosted, true);
  assert.ok(postedBody.includes('Aqui está o contexto relevante para este PR.'));
  assert.ok(postedBody.includes('<!-- sha: 2222222 -->'));

  const event = await repositories.getLastWebhookEvent();
  assert.equal(event.status, 'processed');
  assert.equal(event.rawPayload.prNumber, 77);
});

test('github pull request webhook skips processing when title contains skip-kote keyword', async (t) => {
  configureEnv();
  const repositories = await createPostgresTestRepositories(t);
  const user = await repositories.userRepository.createUser({ email: 'pr-skip@example.com', displayName: 'PR User', passwordHash: 'hash', role: 'user' });
  const workspace = await repositories.contentRepository.upsertWorkspace(user.id, {
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
    workspaceId: workspace.id,
    workspaceSlug: 'default',
    externalId: '101',
    fullName: 'acme/api',
    htmlUrl: 'https://github.com/acme/api',
    description: null,
    defaultBranch: null,
  });
  await repositories.contentRepository.upsertProject(user.id, {
    workspaceId: workspace.id,
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

  let prCommentPosted = false;
  const githubPrGatewayMock = {
    verifyWebhookSignature() {},
    async fetchInstallationToken() { return 'github-token'; },
    async fetchComparePayload() { return { commits: [], files: [] }; },
    async fetchPullRequestComments() { return []; },
    async postPullRequestComment() {
      prCommentPosted = true;
      return true;
    },
  };

  const githubRepositoryResolution = new GithubRepositoryResolutionService(
    repositories.contentRepository,
    repositories.credentialRepository,
    repositories.runtimeEnvironmentProvider,
    githubPrGatewayMock,
  );
  const handler = new HandleGithubPullRequestUseCase(
    repositories.externalIdentityRepository,
    repositories.webhookEventRepository,
    repositories.runtimeEnvironmentProvider,
    githubPrGatewayMock,
    {} ,
    {} ,
    {} ,
    repositories.quotaService,
    null,
    null,
    githubRepositoryResolution,
    repositories.contentRepository,
    repositories.credentialRepository,
  );

  const payload = githubPrBody('opened', 78);
  payload.pull_request.title = 'feat: something [skip-kote] new';
  const result = await handler.execute(signedGithubPrInput(payload), { synchronous: true });

  assert.equal(result.ok, true);
  assert.equal(result.processed, false);
  assert.equal(result.ignored, 'skipped_by_title_keyword');
  assert.equal(prCommentPosted, false);
});

test('github pull request webhook skips posting comments when a comment already exists for current headSha', async (t) => {
  configureEnv();
  const repositories = await createPostgresTestRepositories(t);
  const user = await repositories.userRepository.createUser({ email: 'pr-dup@example.com', displayName: 'PR User', passwordHash: 'hash', role: 'user' });
  const workspace = await repositories.contentRepository.upsertWorkspace(user.id, {
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
    workspaceId: workspace.id,
    workspaceSlug: 'default',
    externalId: '101',
    fullName: 'acme/api',
    htmlUrl: 'https://github.com/acme/api',
    description: null,
    defaultBranch: null,
  });
  await repositories.contentRepository.upsertProject(user.id, {
    workspaceId: workspace.id,
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

  let prCommentPosted = false;
  const githubPrGatewayMock = {
    verifyWebhookSignature() {},
    async fetchInstallationToken() { return 'github-token'; },
    async fetchInstallationRepositories() { return [{ fullName: 'acme/api' }]; },
    async fetchComparePayload() { return { commits: [], files: [] }; },
    async fetchPullRequestComments() {
      return [{ id: 1234, body: 'Some previous comment\n\n<!-- sha: 2222222 -->' }];
    },
    async postPullRequestComment() {
      prCommentPosted = true;
      return true;
    },
  };

  const githubRepositoryResolution = new GithubRepositoryResolutionService(
    repositories.contentRepository,
    repositories.credentialRepository,
    repositories.runtimeEnvironmentProvider,
    githubPrGatewayMock,
  );
  const handler = new HandleGithubPullRequestUseCase(
    repositories.externalIdentityRepository,
    repositories.webhookEventRepository,
    repositories.runtimeEnvironmentProvider,
    githubPrGatewayMock,
    {} ,
    {} ,
    {} ,
    repositories.quotaService,
    null,
    null,
    githubRepositoryResolution,
    repositories.contentRepository,
    repositories.credentialRepository,
  );

  const result = await handler.execute(signedGithubPrInput(githubPrBody('opened', 79)), { synchronous: true });

  assert.equal(result.ok, true);
  assert.equal(result.processed, false);
  assert.equal(result.ignored, 'comment_already_exists_for_sha');
  assert.equal(prCommentPosted, false);
});


