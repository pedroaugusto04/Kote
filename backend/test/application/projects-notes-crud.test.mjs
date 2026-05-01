import test from 'node:test';
import assert from 'node:assert/strict';

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
    links: ['60 Reminders/platform/2026/04/reminder.md'],
  });
  const reminder = await repositories.contentRepository.upsertNote(userId, {
    path: '60 Reminders/platform/2026/04/reminder.md',
    type: 'reminder',
    title: 'Reminder Deploy antigo',
    projectSlug: 'platform',
    workspaceSlug: 'default',
    status: 'open',
    tags: ['deploy'],
    occurredAt: '2026-04-29T12:30:00.000Z',
    sourceChannel: 'external',
    summary: 'Deploy antigo',
    markdown: '',
    frontmatter: {},
    metadata: { sourceNotePath: note.path, reminderDate: '2026-04-29', reminderTime: '09:30', reminderAt: '2026-04-29T12:30:00.000Z' },
    origin: 'postgres',
    source: 'manual-api',
    links: [note.path],
  });
  return { note, reminder };
}

test('updates manual note content and reminder sibling', async (t) => {
  const repositories = await createPostgresTestRepositories(t);
  const user = await repositories.createTestUser();
  await seedProject(repositories, user.id);
  const { note, reminder: seededReminder } = await seedManualNote(repositories, user.id);

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
  const updated = await repositories.contentRepository.getNoteById(user.id, note.id);
  const reminder = await repositories.contentRepository.getNoteById(user.id, seededReminder.id);
  assert.equal(updated?.metadata.rawText, 'validar deploy final');
  assert.deepEqual(updated?.tags, ['release']);
  assert.match((await repositories.objectStorage.get(updated.markdownStorageKey)).toString('utf8'), /validar deploy final/);
  assert.doesNotMatch((await repositories.objectStorage.get(updated.markdownStorageKey)).toString('utf8'), /confirmar deploy/);
  assert.equal(reminder?.metadata.reminderDate, '2026-05-01');
  assert.equal(reminder?.metadata.reminderTime, '10:15');
});

test('removes reminder sibling when manual note reminder is cleared', async (t) => {
  const repositories = await createPostgresTestRepositories(t);
  const user = await repositories.createTestUser();
  await seedProject(repositories, user.id);
  const { note, reminder } = await seedManualNote(repositories, user.id);

  const useCase = new UpdateManualNoteUseCase(repositories.contentRepository);
  await useCase.execute({
    id: note.id,
    title: 'Deploy revisado',
    rawText: 'validar deploy final',
    tags: ['release'],
    reminderDate: '',
    reminderTime: '',
  }, user.id);

  assert.equal(await repositories.contentRepository.getNoteById(user.id, reminder.id), null);
});

test('deletes manual note with reminder cascade and editor detail', async (t) => {
  const repositories = await createPostgresTestRepositories(t);
  const user = await repositories.createTestUser();
  await seedProject(repositories, user.id);
  const { note, reminder } = await seedManualNote(repositories, user.id);
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
  assert.equal(await repositories.contentRepository.getNoteById(user.id, reminder.id), null);
  assert.equal((await repositories.contentRepository.listAttachments(user.id, note.id)).length, 0);
  assert.equal(repositories.objectStorage.deletedKeys.includes(note.markdownStorageKey), true);
  assert.equal(repositories.objectStorage.deletedKeys.includes(reminder.markdownStorageKey), true);
  assert.equal(repositories.objectStorage.deletedKeys.includes(attachments[0].storageKey), true);
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
  const repositories = await createPostgresTestRepositories(t);
  const user = await repositories.createTestUser();
  await seedProject(repositories, user.id);

  const repo = await repositories.contentRepository.upsertRepository({
    workspaceSlug: 'default',
    externalId: '0',
    fullName: 'acme/platform',
    htmlUrl: 'https://github.com/acme/platform',
    description: null,
    defaultBranch: null,
  });

  const result = await new UpdateProjectUseCase(repositories.contentRepository).execute({
    projectSlug: 'platform',
    displayName: 'Platform Core',
    repositoryIds: [repo.id],
    aliases: ['core'],
    defaultTags: ['backend'],
  }, user.id);

  assert.equal(result.ok, true);
  assert.equal(result.project.projectSlug, 'platform');
  assert.equal(result.project.displayName, 'Platform Core');
});
