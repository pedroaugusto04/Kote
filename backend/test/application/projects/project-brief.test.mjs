import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';

import { GenerateProjectBriefUseCase, GetProjectBriefUseCase, CreateWorkspaceUseCase } from '../../../dist/application/use-cases/index.js';
import { createPostgresTestRepositories } from '../../helpers/postgres-test-repositories.mjs';

function configureAi() {
  process.env.KB_CREDENTIALS_ENCRYPTION_KEY = crypto.randomBytes(32).toString('base64');
  process.env.KB_PROJECT_BRIEF_AI_PROVIDER = 'openai';
  process.env.KB_PROJECT_BRIEF_AI_BASE_URL = 'https://ai.example.com/v1';
  process.env.KB_PROJECT_BRIEF_AI_MODEL = 'brief-model';
  process.env.KB_PROJECT_BRIEF_AI_API_KEY = 'brief-key';
}

async function setup(t) {
  configureAi();
  const repositories = await createPostgresTestRepositories(t);
  const user = await repositories.createTestUser();
  await new CreateWorkspaceUseCase(
    repositories.contentRepository,
    repositories.credentialRepository,
    repositories.runtimeEnvironmentProvider,
  ).execute({ displayName: 'Default', workspaceSlug: 'default' }, user.id);
  await repositories.contentRepository.upsertProject(user.id, {
    projectSlug: 'platform',
    displayName: 'Platform',
    repositories: [],
    workspaceSlug: 'default',
    defaultTags: [],
    enabled: true,
  });
  return { repositories, user };
}

function useCase(repositories, gateway) {
  return new GenerateProjectBriefUseCase(
    repositories.contentRepository,
    repositories.credentialRepository,
    repositories.projectBriefHistoryRepository,
    gateway,
    repositories.runtimeEnvironmentProvider,
  );
}

test('generate project brief uses recent project items, filters invalid sources and saves history', async (t) => {
  const { repositories, user } = await setup(t);
  for (let index = 0; index < 32; index += 1) {
    await repositories.contentRepository.upsertNote(user.id, {
      path: `20 Inbox/platform/item-${index}.md`,
      type: index % 2 === 0 ? 'decision' : 'event',
      title: `Item ${index}`,
      projectSlug: 'platform',
      workspaceSlug: 'default',
      folderId: null,
      status: 'active',
      tags: ['platform'],
      occurredAt: new Date(Date.UTC(2026, 4, 1, 12, index)).toISOString(),
      sourceChannel: 'manual',
      summary: `Summary ${index}`,
      markdown: '',
      frontmatter: {},
      metadata: { rawText: `Raw ${index}` },
      origin: 'test',
      source: 'manual',
      links: [],
    });
  }

  const seenPayloads = [];
  const gateway = {
    async generate(_config, payload) {
      seenPayloads.push(payload);
      return {
        projectSlug: payload.projectSlug,
        generatedAt: payload.generatedAt,
        summary: 'The platform project has recent deployment and decision activity.',
        status: 'Active',
        recentChanges: ['Deployment notes were captured.'],
        decisions: ['A recent decision was recorded.'],
        openItems: [],
        risks: [],
        nextSteps: ['Review the latest deployment note.'],
        sources: [
          { noteId: payload.items[0].noteId, title: payload.items[0].title, path: payload.items[0].path, date: payload.items[0].date },
          { noteId: 'missing-note', title: 'Invalid', path: 'invalid.md', date: '2026-05-01' },
        ],
      };
    },
  };

  const result = await useCase(repositories, gateway).execute(user.id, 'platform');

  assert.equal(result.ok, true);
  assert.equal(result.fallback, false);
  assert.equal(seenPayloads[0].items.length, 30);
  assert.equal(result.brief.sources.length, 1);
  assert.notEqual(result.brief.sources[0].noteId, 'missing-note');

  const latest = await repositories.projectBriefHistoryRepository.findLatest({
    userId: user.id,
    workspaceSlug: 'default',
    projectSlug: 'platform',
  });
  assert.equal(latest.brief.summary, result.brief.summary);
  assert.equal(latest.contextWindow, 30);
  assert.equal(latest.provider, 'openai');
  assert.equal(latest.model, 'brief-model');
});

test('generate project brief saves deterministic empty brief when project has no items', async (t) => {
  const { repositories, user } = await setup(t);
  const gateway = { async generate() { throw new Error('should_not_call_ai'); } };

  const result = await useCase(repositories, gateway).execute(user.id, 'platform');

  assert.equal(result.ok, true);
  assert.equal(result.fallback, false);
  assert.match(result.brief.summary, /No recent project items/);
  const latest = await repositories.projectBriefHistoryRepository.findLatest({
    userId: user.id,
    workspaceSlug: 'default',
    projectSlug: 'platform',
  });
  assert.equal(latest.brief.summary, result.brief.summary);
});

test('generate project brief returns latest saved brief as fallback after AI failure', async (t) => {
  const { repositories, user } = await setup(t);
  await repositories.contentRepository.upsertNote(user.id, {
    path: '20 Inbox/platform/item.md',
    type: 'event',
    title: 'Deployment',
    projectSlug: 'platform',
    workspaceSlug: 'default',
    folderId: null,
    status: 'active',
    tags: [],
    occurredAt: '2026-05-01T12:00:00.000Z',
    sourceChannel: 'manual',
    summary: 'Deployment summary',
    markdown: '',
    frontmatter: {},
    metadata: { rawText: 'Deployment raw text' },
    origin: 'test',
    source: 'manual',
    links: [],
  });
  const firstGateway = {
    async generate(_config, payload) {
      return {
        projectSlug: payload.projectSlug,
        generatedAt: payload.generatedAt,
        summary: 'Saved brief',
        status: 'Active',
        recentChanges: [],
        decisions: [],
        openItems: [],
        risks: [],
        nextSteps: [],
        sources: [],
      };
    },
  };
  await useCase(repositories, firstGateway).execute(user.id, 'platform');

  const failingGateway = { async generate() { throw new Error('ai_down'); } };
  const result = await useCase(repositories, failingGateway).execute(user.id, 'platform');

  assert.equal(result.ok, true);
  assert.equal(result.fallback, true);
  assert.equal(result.fallbackReason, 'generation_failed');
  assert.equal(result.brief.summary, 'Saved brief');
});

test('get project brief returns latest saved brief without calling AI', async (t) => {
  const { repositories, user } = await setup(t);
  const generated = await useCase(repositories, {
    async generate(_config, payload) {
      return {
        projectSlug: payload.projectSlug,
        generatedAt: payload.generatedAt,
        summary: 'Saved brief for later display',
        status: 'Active',
        recentChanges: [],
        decisions: [],
        openItems: [],
        risks: [],
        nextSteps: [],
        sources: [],
      };
    },
  }).execute(user.id, 'platform');

  const result = await new GetProjectBriefUseCase(
    repositories.contentRepository,
    repositories.projectBriefHistoryRepository,
  ).execute(user.id, 'platform');

  assert.equal(result.ok, true);
  assert.equal(result.source, 'history');
  assert.equal(result.brief.summary, generated.brief.summary);
});

test('get project brief returns null when no saved brief exists', async (t) => {
  const { repositories, user } = await setup(t);

  const result = await new GetProjectBriefUseCase(
    repositories.contentRepository,
    repositories.projectBriefHistoryRepository,
  ).execute(user.id, 'platform');

  assert.deepEqual(result, { ok: true, source: 'none', brief: null });
});

test('generate project brief rejects missing project, disconnected AI, and AI failure without history', async (t) => {
  const { repositories, user } = await setup(t);

  await assert.rejects(() => useCase(repositories, { async generate() { return null; } }).execute(user.id, 'missing'));

  await repositories.credentialRepository.revokeCredential(
    user.id,
    'default',
    'project-brief-ai',
    { revoked: true },
  );
  await assert.rejects(
    () => useCase(repositories, { async generate() { return null; } }).execute(user.id, 'platform'),
    /project_brief_ai_not_connected/,
  );
});
