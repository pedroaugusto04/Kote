import test from 'node:test';
import assert from 'node:assert/strict';

import { buildGithubReviewEvent } from '../../../dist/application/github-review.js';
import { HandleGithubPushUseCase } from '../../../dist/application/use-cases/index.js';

function githubWebhookInput(body) {
  return {
    headers: {
      'x-hub-signature-256': 'sha256=test',
      'x-github-event': 'push',
    },
    body,
    rawBody: JSON.stringify(body),
  };
}

function githubWebhookBody() {
  return {
    ref: 'refs/heads/main',
    before: 'abc123',
    after: 'def456',
    compare: 'https://github.com/acme/api/compare/abc123...def456',
    installation: { id: 42 },
    repository: {
      id: 101,
      full_name: 'acme/api',
      name: 'api',
      private: true,
    },
    pusher: { name: 'Pedro' },
    sender: { login: 'octocat' },
    head_commit: {
      message: 'private commit message',
      timestamp: '2026-04-27T10:00:00.000Z',
      url: 'https://github.com/acme/api/commit/def456',
    },
    commits: [
      {
        id: 'def456',
        message: 'private commit message',
        modified: ['src/private.ts'],
      },
    ],
  };
}

function githubHandlerFixture(projects = []) {
  const events = [];
  const calls = { ingest: 0, compare: 0, review: 0 };
  const handler = new HandleGithubPushUseCase(
    {
      async execute(payload) {
        calls.ingest += 1;
        return { ok: true, project: payload.event.projectSlug };
      },
    },
    {
      async findExternalIdentity() {
        return { userId: 'user-1', workspaceSlug: 'default' };
      },
    },
    {
      async recordWebhookEvent(event) {
        events.push(event);
        return event;
      },
    },
    {
      read: () => ({
        githubWebhookSecret: 'github-webhook-secret',
        githubAppId: '123',
        githubAppPrivateKey: 'private-key',
        reviewAiProvider: 'none',
        reviewAiBaseUrl: '',
        reviewAiModel: '',
        reviewAiApiKey: '',
      }),
    },
    {
      verifyWebhookSignature() {},
      async fetchInstallationToken() {
        return 'installation-token';
      },
      async fetchComparePayload() {
        calls.compare += 1;
        return { commits: [], files: [] };
      },
    },
    {
      async generate() {
        calls.review += 1;
        return {
          summary: 'review summary',
          impact: '',
          risks: [],
          nextSteps: [],
          reviewFindings: [],
        };
      },
    },
    {
      async listProjects() {
        return projects;
      },
    },
  );
  return { handler, events, calls };
}

test('github push is converted to canonical code review event', async () => {
  const event = await buildGithubReviewEvent(
    {
      headers: {},
      body: {
        ref: 'refs/heads/main',
        before: 'abc123',
        after: 'def456',
        repository: {
          full_name: 'pedroaugusto04/N8N-Automations',
          name: 'N8N-Automations',
        },
        pusher: {
          name: 'Pedro',
        },
        head_commit: {
          message: 'refactor knowledge base',
          timestamp: '2026-04-27T10:00:00.000Z',
          url: 'https://github.com/example/commit/def456',
        },
        commits: [
          {
            id: 'def456',
            message: 'refactor knowledge base',
            modified: ['knowledge-base/src/index.ts'],
          },
        ],
      },
      rawBody: '{}',
    },
    {
      webhookSecret: '',
      githubWebhookSecret: '',
      attachmentMaxVaultBytes: 0,
      conversationTimeoutMs: 0,
      reviewAiProvider: 'none',
      reviewAiBaseUrl: '',
      reviewAiModel: '',
      reviewAiApiKey: '',
      conversationAiProvider: 'none',
      conversationAiBaseUrl: '',
      conversationAiModel: '',
      conversationAiApiKey: '',
      publicBaseUrl: 'https://example.com',
      apiPublicBaseUrl: 'https://example.com/api',
      allowedOrigins: [],
      trustProxy: false,
      githubPushWebhookPath: '/n8n/webhook/kb-github-push',
      ingestWebhookPath: '/n8n/webhook/kb-event',
      whatsappWebhookPath: '/api/webhooks/whatsapp',
      queryWebhookPath: '/n8n/webhook/kb-query',
      githubAppInstallUrl: 'https://github.com/apps/example/installations/new',
      githubAppClientId: '',
      githubAppClientSecret: '',
      githubAppId: '',
      githubAppPrivateKey: '',
      telegramBotToken: '',
      telegramWebhookToken: '',
      telegramChatId: '',
      whatsappWebhookApiKey: '',
      evolutionApiKey: '',
      evolutionApiUrl: '',
      evolutionApiPublicUrl: '',
      evolutionInstanceName: '',
      databaseUrl: '',
      adminEmail: '',
      adminPassword: '',
      jwtAccessSecret: '',
      jwtRefreshSecret: '',
      accessTokenTtlSeconds: 0,
      refreshTokenTtlSeconds: 0,
      credentialsEncryptionKey: '',
      internalServiceToken: '',
    },
    {
      githubIntegrationGateway: {
        verifyWebhookSignature() {},
        async fetchInstallationToken() {
          return '';
        },
        async fetchComparePayload() {
          return { commits: [], files: [] };
        },
      },
      reviewAnalysisGateway: {
        async generate() {
          return {
            summary: 'refactor knowledge base',
            impact: '',
            risks: [],
            nextSteps: [],
            reviewFindings: [],
          };
        },
      },
    },
  );

  assert.equal(event.event.type, 'code_review');
  assert.equal(event.classification.canonicalType, 'knowledge');
  assert.match(event.content.title, /\[N8N-Automations\]/);
  assert.equal(event.metadata.repoFullName, 'pedroaugusto04/N8N-Automations');
});

test('github app push ignores repositories not selected in the workspace', async () => {
  const { handler, events, calls } = githubHandlerFixture([]);

  const result = await handler.execute(githubWebhookInput(githubWebhookBody()));

  assert.deepEqual(result, {
    ok: true,
    processed: false,
    ignored: 'github_repository_not_selected',
  });
  assert.equal(calls.ingest, 0);
  assert.equal(calls.compare, 0);
  assert.equal(calls.review, 0);
  const ignoredEvent = events.at(-1);
  assert.equal(ignoredEvent.status, 'ignored');
  assert.equal(ignoredEvent.error, 'github_repository_not_selected');
  assert.deepEqual(ignoredEvent.rawPayload, {
    installationId: '42',
    repositoryId: '101',
    repositoryFullName: 'acme/api',
    repositoryPrivate: true,
    ref: 'refs/heads/main',
    before: 'abc123',
    after: 'def456',
    deleted: false,
    pusherName: 'Pedro',
    senderLogin: 'octocat',
  });
  const serializedPayload = JSON.stringify(ignoredEvent.rawPayload);
  assert.equal(serializedPayload.includes('private commit message'), false);
  assert.equal(serializedPayload.includes('src/private.ts'), false);
  assert.equal(serializedPayload.includes('compare'), false);
});

test('github app push processes selected repositories with minimized audit payload', async () => {
  const { handler, events, calls } = githubHandlerFixture([
    {
      projectSlug: 'platform',
      displayName: 'Platform',
      workspaceSlug: 'default',
      enabled: true,
      defaultTags: [],
      repositories: [{ fullName: 'acme/api' }],
    },
  ]);

  const result = await handler.execute(githubWebhookInput(githubWebhookBody()));

  assert.equal(result.ok, true);
  assert.equal(result.payload.event.projectSlug, 'platform');
  assert.equal(result.ingestResult.project, 'platform');
  assert.equal(calls.ingest, 1);
  assert.equal(calls.compare, 1);
  assert.equal(calls.review, 1);
  const processedEvent = events.at(-1);
  assert.equal(processedEvent.status, 'processed');
  assert.equal(processedEvent.rawPayload.repositoryFullName, 'acme/api');
  assert.equal(processedEvent.rawPayload.repositoryPrivate, true);
  const serializedPayload = JSON.stringify(processedEvent.rawPayload);
  assert.equal(serializedPayload.includes('private commit message'), false);
  assert.equal(serializedPayload.includes('src/private.ts'), false);
  assert.equal(serializedPayload.includes('compare'), false);
});
