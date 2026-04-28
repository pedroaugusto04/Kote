import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';

import { MemoryKnowledgeStore } from '../dist/application/knowledge-store.js';
import { BuildDashboardUseCase, HandleGithubPushUseCase, IngestEntryUseCase } from '../dist/application/use-cases/index.js';
import { PostgresContentQueryRepository } from '../dist/infrastructure/repositories/postgres-content.repository.js';

function configureEnv() {
  process.env.KB_GITHUB_APP_WEBHOOK_SECRET = 'github-webhook-secret';
  process.env.KB_REVIEW_AI_PROVIDER = 'none';
}

function canonicalPayload(projectSlug = 'acme-api') {
  return {
    schemaVersion: 1,
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

test('new users start with an empty scoped dashboard and cannot see another user notes', async () => {
  configureEnv();
  const store = new MemoryKnowledgeStore();
  const ingest = new IngestEntryUseCase(store);
  const dashboard = new BuildDashboardUseCase(
    store,
    new PostgresContentQueryRepository(store),
  );
  const userA = await store.createUser({ email: 'a@example.com', displayName: 'A', passwordHash: 'hash', role: 'user' });
  const userB = await store.createUser({ email: 'b@example.com', displayName: 'B', passwordHash: 'hash', role: 'user' });

  const emptyDashboard = await dashboard.execute(userB.id);
  assert.deepEqual(emptyDashboard.workspaces, []);
  assert.deepEqual(emptyDashboard.projects, []);
  assert.deepEqual(emptyDashboard.notes, []);
  assert.deepEqual(emptyDashboard.reviews, []);
  assert.deepEqual(emptyDashboard.reminders, []);
  assert.equal(emptyDashboard.home.metrics.every((metric) => metric.value === 0), true);

  await ingest.execute(canonicalPayload('acme-api'), userA.id, 'default');

  const dashboardA = await dashboard.execute(userA.id);
  const dashboardB = await dashboard.execute(userB.id);
  assert.equal(dashboardA.notes.length, 1);
  assert.equal(dashboardA.projects[0].projectSlug, 'acme-api');
  assert.equal(dashboardB.notes.length, 0);
  assert.equal(dashboardB.projects.length, 0);
  assert.equal(dashboardB.home.metrics.every((metric) => metric.value === 0), true);
});

test('github app webhook resolves user by installation id and rejects unknown identities', async () => {
  configureEnv();
  const store = new MemoryKnowledgeStore();
  const user = await store.createUser({ email: 'owner@example.com', displayName: 'Owner', passwordHash: 'hash', role: 'user' });
  const ingest = new IngestEntryUseCase(store);
  const handler = new HandleGithubPushUseCase(ingest, store);

  await assert.rejects(() => handler.execute(signedGithubInput(githubBody(404))), /identity_not_found/);
  assert.equal((await store.listNotes(user.id)).length, 0);

  await store.upsertExternalIdentity({
    userId: user.id,
    workspaceSlug: 'default',
    provider: 'github-app',
    identityType: 'installation_id',
    externalId: '42',
    publicMetadata: {},
  });

  const result = await handler.execute(signedGithubInput(githubBody(42)));
  assert.equal(result.ok, true);
  const notes = await store.listNotes(user.id);
  assert.equal(notes.length, 1);
  assert.equal(notes[0].sourceChannel, 'github-push');
});
