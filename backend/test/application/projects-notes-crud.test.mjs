import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';

import { encryptConfig } from '../../dist/application/credentials.js';
import { GithubRepositoryResolutionService } from '../../dist/application/services/github-repository-resolution.service.js';
import { DeleteManualNoteUseCase, DeleteProjectUseCase, GetNoteDetailUseCase, UpdateManualNoteUseCase, UpdateProjectUseCase } from '../../dist/application/use-cases/index.js';
import { createPostgresTestRepositories } from '../helpers/postgres-test-repositories.mjs';

async function seedProject(repositories, userId) {
  await repositories.contentRepository.upsertWorkspace(userId, {
    workspaceSlug: 'default',
    displayName: 'Default',
    whatsappGroupJid: '',
    telegramChatId: '',
    githubRepos: ['acme/api'],
    projectSlugs: ['inbox', 'platform'],
    createdAt: '2026-04-27T10:00:00.000Z',
    updatedAt: '2026-04-27T10:00:00.000Z',
  });
  const repo = await repositories.contentRepository.upsertRepository({
    workspaceSlug: 'default',
    externalId: '0',
    fullName: 'acme/api',
    htmlUrl: 'https://github.com/acme/api',
    description: null,
    defaultBranch: null,
  });
  await repositories.contentRepository.upsertProject(userId, {
    projectSlug: 'platform',
    displayName: 'Platform',
    repositories: [repo],
    workspaceSlug: 'default',
    aliases: ['api'],
    defaultTags: ['backend'],
    enabled: true,
  });
}

async function seedManualNote(repositories, userId) {
  const note = await repositories.contentRepository.upsertNote(userId, {
    path: '20 Inbox/platform/2026/04/note.md',
    type: 'event',
    title: 'Deploy antigo',
    projectSlug: 'platform',
    workspaceSlug: 'default',
    status: 'active',
    tags: ['deploy'],
    occurredAt: '2026-04-27T10:00:00.000Z',
    sourceChannel: 'external',
    summary: 'confirmar deploy',
    markdown: '# Deploy antigo\n\n## Resumo\n\nconfirmar deploy\n',
    frontmatter: { id: 'manual:1' },
    metadata: { manual: true, rawText: 'confirmar deploy', reminderDate: '2026-04-29', reminderTime: '09:30' },
    origin: 'postgres',
    source: 'manual-api',
    links: [],
  });
  return { note };
}

test('updates manual note content and reminder metadata only', async (t) => {
  const repositories = await createPostgresTestRepositories(t);
  const user = await repositories.createTestUser();
  await seedProject(repositories, user.id);
  const { note } = await seedManualNote(repositories, user.id);

  const useCase = new UpdateManualNoteUseCase(repositories.contentRepository);
  const result = await useCase.execute({
    id: note.id,
    title: 'Deploy revisado',
    rawText: 'validar deploy final',
    tags: ['release'],
    reminderDate: '2026-05-01',
    reminderTime: '10:15',
  }, user.id);

  assert.equal(result.ok, true);
  assert.equal(result.noteId, note.id);
  const updated = await repositories.contentRepository.getNoteById(user.id, note.id);
  assert.equal(updated?.metadata.rawText, 'validar deploy final');
  assert.deepEqual(updated?.tags, ['release']);
  assert.match((await repositories.objectStorage.get(updated.markdownStorageKey)).toString('utf8'), /validar deploy final/);
  assert.doesNotMatch((await repositories.objectStorage.get(updated.markdownStorageKey)).toString('utf8'), /confirmar deploy/);
  assert.equal(updated?.metadata.reminderDate, '2026-05-01');
  assert.equal(updated?.metadata.reminderTime, '10:15');
});

test('clears manual note reminder metadata', async (t) => {
  const repositories = await createPostgresTestRepositories(t);
  const user = await repositories.createTestUser();
  await seedProject(repositories, user.id);
  const { note } = await seedManualNote(repositories, user.id);

  const useCase = new UpdateManualNoteUseCase(repositories.contentRepository);
  await useCase.execute({
    id: note.id,
    title: 'Deploy revisado',
    rawText: 'validar deploy final',
    tags: ['release'],
    reminderDate: '',
    reminderTime: '',
  }, user.id);

  const updated = await repositories.contentRepository.getNoteById(user.id, note.id);
  assert.equal(updated?.metadata.reminderDate, '');
  assert.equal(updated?.metadata.reminderTime, '');
  assert.equal(updated?.metadata.reminderAt, '');
  assert.equal((await repositories.contentQueryRepository.listReminders(user.id)).length, 0);
});

test('deletes manual note and attachments', async (t) => {
  const repositories = await createPostgresTestRepositories(t);
  const user = await repositories.createTestUser();
  await seedProject(repositories, user.id);
  const { note } = await seedManualNote(repositories, user.id);
  await repositories.contentRepository.saveAttachment(user.id, {
    noteId: note.id,
    fileName: 'evidence.txt',
    mimeType: 'text/plain',
    sizeBytes: 4,
    dataBase64: 'dGVzdA==',
    checksumSha256: 'checksum',
    metadata: {},
  });

  const detail = await new GetNoteDetailUseCase(repositories.contentRepository).execute(user.id, note.id);
  assert.equal(detail?.editor?.rawText, 'confirmar deploy');
  const attachments = await repositories.contentRepository.listAttachments(user.id, note.id);
  assert.equal(attachments.length, 1);
  assert.equal(Object.hasOwn(attachments[0], 'contentBase64'), false);
  assert.equal((await repositories.objectStorage.get(attachments[0].storageKey)).toString('utf8'), 'test');

  await new DeleteManualNoteUseCase(repositories.contentRepository).execute(note.id, user.id);
  assert.equal(await repositories.contentRepository.getNoteById(user.id, note.id), null);
  assert.equal((await repositories.contentRepository.listAttachments(user.id, note.id)).length, 0);
  assert.equal(repositories.objectStorage.deletedKeys.includes(note.markdownStorageKey), true);
  assert.equal(repositories.objectStorage.deletedKeys.includes(attachments[0].storageKey), true);
  assert.equal((await repositories.contentQueryRepository.listReminders(user.id)).length, 0);
});

test('rejects editing non-manual notes and blocks project deletion with notes', async (t) => {
  const repositories = await createPostgresTestRepositories(t);
  const user = await repositories.createTestUser();
  await seedProject(repositories, user.id);
  const reviewNote = await repositories.contentRepository.upsertNote(user.id, {
    path: '20 Inbox/platform/review.md',
    type: 'event',
    title: 'Review',
    projectSlug: 'platform',
    workspaceSlug: 'default',
    status: 'active',
    tags: [],
    occurredAt: '2026-04-27T10:00:00.000Z',
    sourceChannel: 'github-push',
    summary: 'review',
    markdown: '',
    frontmatter: { id: 'review:1' },
    metadata: { manual: false },
    origin: 'postgres',
    source: 'github-push',
    links: [],
  });

  await assert.rejects(
    () => new UpdateManualNoteUseCase(repositories.contentRepository).execute({
      id: reviewNote.id,
      title: 'Review',
      rawText: 'texto',
      tags: [],
      reminderDate: '',
      reminderTime: '',
    }, user.id),
  );

  await assert.rejects(() => new DeleteProjectUseCase(repositories.contentRepository).execute('platform', user.id));
});

test('updates project metadata while keeping slug immutable', async (t) => {
  process.env.KB_CREDENTIALS_ENCRYPTION_KEY = crypto.randomBytes(32).toString('base64');
  const repositories = await createPostgresTestRepositories(t);
  const user = await repositories.createTestUser();
  await seedProject(repositories, user.id);
  await repositories.credentialRepository.upsertCredential({
    userId: user.id,
    workspaceSlug: 'default',
    provider: 'github-app',
    status: 'connected',
    encryptedConfig: encryptConfig({ installationId: '42', accountLogin: 'acme' }),
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
          { id: 102, full_name: 'acme/platform', name: 'platform', private: true, html_url: 'https://github.com/acme/platform', default_branch: 'main', owner: { login: 'acme' } },
        ],
      });
    }
    return new Response(null, { status: 404 });
  };

  const githubRepositoryResolution = new GithubRepositoryResolutionService(repositories.contentRepository, repositories.credentialRepository);
  const result = await new UpdateProjectUseCase(repositories.contentRepository, githubRepositoryResolution).execute({
    projectSlug: 'platform',
    displayName: 'Platform Core',
    repositoryIds: ['102'],
    aliases: ['core'],
    defaultTags: ['backend'],
  }, user.id);

  assert.equal(result.ok, true);
  assert.equal(result.project.projectSlug, 'platform');
  assert.equal(result.project.displayName, 'Platform Core');
  assert.equal(result.project.repositories[0].externalId, '102');
  globalThis.fetch = originalFetch;
  process.env.KB_GITHUB_APP_ID = originalAppId;
  process.env.KB_GITHUB_APP_PRIVATE_KEY = originalPrivateKey;
});
