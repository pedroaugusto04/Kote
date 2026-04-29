import test from 'node:test';
import assert from 'node:assert/strict';

import { DeleteManualNoteUseCase, DeleteProjectUseCase, GetNoteDetailUseCase, UpdateManualNoteUseCase, UpdateProjectUseCase } from '../../dist/application/use-cases/index.js';
import { createMemoryRepositories } from '../../dist/infrastructure/repositories/memory-repositories.js';

async function seedProject(repositories) {
  await repositories.contentRepository.upsertWorkspace('user-1', {
    workspaceSlug: 'default',
    displayName: 'Default',
    whatsappGroupJid: '',
    telegramChatId: '',
    githubRepos: ['acme/api'],
    projectSlugs: ['inbox', 'platform'],
    createdAt: '2026-04-27T10:00:00.000Z',
    updatedAt: '2026-04-27T10:00:00.000Z',
  });
  await repositories.contentRepository.upsertProject('user-1', {
    projectSlug: 'platform',
    displayName: 'Platform',
    repoFullName: 'acme/api',
    workspaceSlug: 'default',
    aliases: ['api'],
    defaultTags: ['backend'],
    enabled: true,
  });
}

async function seedManualNote(repositories) {
  const note = await repositories.contentRepository.upsertNote('user-1', {
    id: 'note-1',
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
  const reminder = await repositories.contentRepository.upsertNote('user-1', {
    id: 'reminder-1',
    path: '60 Reminders/platform/2026/04/reminder.md',
    type: 'reminder',
    title: 'Reminder Deploy antigo',
    projectSlug: 'platform',
    workspaceSlug: 'default',
    status: 'open',
    tags: ['deploy'],
    occurredAt: '2026-04-29T09:30:00-03:00',
    sourceChannel: 'external',
    summary: 'Deploy antigo',
    markdown: '',
    frontmatter: {},
    metadata: { sourceNotePath: note.path, reminderDate: '2026-04-29', reminderTime: '09:30', reminderAt: '2026-04-29T09:30:00-03:00' },
    origin: 'postgres',
    source: 'manual-api',
    links: [note.path],
  });
  return { note, reminder };
}

test('updates manual note content and reminder sibling', async () => {
  const repositories = createMemoryRepositories();
  await seedProject(repositories);
  await seedManualNote(repositories);

  const useCase = new UpdateManualNoteUseCase(repositories.contentRepository);
  const result = await useCase.execute({
    id: 'note-1',
    title: 'Deploy revisado',
    rawText: 'validar deploy final',
    tags: ['release'],
    reminderDate: '2026-05-01',
    reminderTime: '10:15',
  }, 'user-1');

  assert.equal(result.ok, true);
  const updated = await repositories.contentRepository.getNoteById('user-1', 'note-1');
  const reminder = await repositories.contentRepository.getNoteById('user-1', 'reminder-1');
  assert.equal(updated?.metadata.rawText, 'validar deploy final');
  assert.deepEqual(updated?.tags, ['release']);
  assert.equal(reminder?.metadata.reminderDate, '2026-05-01');
  assert.equal(reminder?.metadata.reminderTime, '10:15');
});

test('removes reminder sibling when manual note reminder is cleared', async () => {
  const repositories = createMemoryRepositories();
  await seedProject(repositories);
  await seedManualNote(repositories);

  const useCase = new UpdateManualNoteUseCase(repositories.contentRepository);
  await useCase.execute({
    id: 'note-1',
    title: 'Deploy revisado',
    rawText: 'validar deploy final',
    tags: ['release'],
    reminderDate: '',
    reminderTime: '',
  }, 'user-1');

  assert.equal(await repositories.contentRepository.getNoteById('user-1', 'reminder-1'), null);
});

test('deletes manual note with reminder cascade and editor detail', async () => {
  const repositories = createMemoryRepositories();
  await seedProject(repositories);
  const { note } = await seedManualNote(repositories);
  await repositories.contentRepository.saveAttachment('user-1', {
    noteId: note.id,
    fileName: 'evidence.txt',
    mimeType: 'text/plain',
    sizeBytes: 4,
    contentBase64: 'dGVzdA==',
    checksumSha256: 'checksum',
    metadata: {},
  });

  const detail = await new GetNoteDetailUseCase(repositories.contentRepository).execute('user-1', note.id);
  assert.equal(detail?.editor?.rawText, 'confirmar deploy');

  await new DeleteManualNoteUseCase(repositories.contentRepository).execute(note.id, 'user-1');
  assert.equal(await repositories.contentRepository.getNoteById('user-1', note.id), null);
  assert.equal(await repositories.contentRepository.getNoteById('user-1', 'reminder-1'), null);
  assert.equal((await repositories.contentRepository.listAttachments('user-1', note.id)).length, 0);
});

test('rejects editing non-manual notes and blocks project deletion with notes', async () => {
  const repositories = createMemoryRepositories();
  await seedProject(repositories);
  await repositories.contentRepository.upsertNote('user-1', {
    id: 'note-review',
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
      id: 'note-review',
      title: 'Review',
      rawText: 'texto',
      tags: [],
      reminderDate: '',
      reminderTime: '',
    }, 'user-1'),
  );

  await assert.rejects(() => new DeleteProjectUseCase(repositories.contentRepository).execute('platform', 'user-1'));
});

test('updates project metadata while keeping slug immutable', async () => {
  const repositories = createMemoryRepositories();
  await seedProject(repositories);

  const result = await new UpdateProjectUseCase(repositories.contentRepository).execute({
    projectSlug: 'platform',
    displayName: 'Platform Core',
    repoFullName: 'acme/platform',
    aliases: ['core'],
    defaultTags: ['backend'],
  }, 'user-1');

  assert.equal(result.ok, true);
  assert.equal(result.project.projectSlug, 'platform');
  assert.equal(result.project.displayName, 'Platform Core');
});
