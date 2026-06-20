import test from 'node:test';
import assert from 'node:assert/strict';

import { CreateManualNoteUseCase, IngestEntryUseCase } from '../../../dist/application/use-cases/index.js';
import { createPostgresTestRepositories } from '../../helpers/postgres-test-repositories.mjs';

function payload() {
  return {
    source: {
      channel: 'n8n-workflow',
      system: 'test-suite',
      actor: 'tester',
      conversationId: 'conv',
      correlationId: 'corr-ingest',
    },
    event: {
      type: 'manual_note',
      occurredAt: '2026-04-27T10:00:00.000Z',
      projectSlug: 'n8n-automations',
    },
    content: {
      rawText: 'revisar rollout do deploy',
      title: 'Deploy rollout',
      attachments: [
        {
          fileName: 'sample.txt',
          mimeType: 'text/plain',
          sizeBytes: 11,
          dataBase64: Buffer.from('hello world').toString('base64'),
        },
      ],
      sections: {
        summary: 'Deploy needs coordinated rollout.',
        impact: 'Can affect webhook availability.',
        risks: ['Downtime'],
        nextSteps: ['Check production logs'],
        reviewFindings: [],
      },
    },
    classification: {
      kind: 'summary',
      canonicalType: 'knowledge',
      importance: 'medium',
      status: 'active',
      tags: ['deploy'],
      decisionFlag: false,
    },
    actions: {
      reminderDate: '2026-04-28',
      reminderTime: '09:30',
      followUpBy: '2026-04-29',
    },
    metadata: {},
  };
}

test('ingest persists one canonical note with derived reminder, attachment and workspace in repository', async (t) => {
  const repositories = await createPostgresTestRepositories(t);
  const user = await repositories.createTestUser();
  await repositories.contentRepository.upsertWorkspace(user.id, {
    workspaceSlug: 'default',
    displayName: 'Default',
    whatsappChatJid: '',
    telegramChatId: '',
    githubRepos: [],
    projectSlugs: ['inbox'],
    createdAt: '2026-04-27T00:00:00.000Z',
    updatedAt: '2026-04-27T00:00:00.000Z',
  });
  const result = await new IngestEntryUseCase(repositories.contentRepository, repositories.runtimeEnvironmentProvider).execute(payload(), user.id, 'default');

  assert.equal(result.ok, true);
  assert.match(result.eventPath, /^20 Inbox\/n8n-automations\//);
  assert.equal(result.attachmentIds.length, 1);
  assert.equal(result.note.type, 'reminder');
  assert.equal(result.note.projectName, 'n8n-automations');
  assert.equal(result.note.folderName, 'Project root');
  assert.equal(result.note.hasReminder, true);
  assert.equal(result.note.reminderDate, '2026-04-28');
  assert.equal(result.note.reminderTime, '12:30');
  assert.equal(result.note.attachmentCount, 1);

  const notes = await repositories.contentRepository.listNotes(user.id);
  assert.equal(notes.filter((note) => note.type === 'knowledge').length, 1);
  const detail = await repositories.contentRepository.getNoteById(user.id, result.noteId);
  assert.equal(detail.metadata.reminderDate, '2026-04-28');
  assert.equal(detail.metadata.reminderTime, '12:30');
  assert.equal(detail.metadata.reminderAt, '2026-04-28T12:30:00.000Z');
  const reminders = await repositories.contentQueryRepository.listReminders(user.id);
  assert.equal(reminders.length, 1);
  assert.equal(reminders[0].id, result.noteId);
  assert.equal(reminders[0].relativePath, result.eventPath);
  assert.match(detail.markdownStorageKey, new RegExp(`^users/${user.id}/workspaces/default/notes/20 Inbox/n8n-automations/`));
  assert.match(detail.markdown, /Deploy needs coordinated rollout/);
  assert.match((await repositories.objectStorage.get(detail.markdownStorageKey)).toString('utf8'), /Deploy needs coordinated rollout/);
  const attachments = await repositories.contentRepository.listAttachments(user.id, result.noteId);
  assert.equal(attachments.length, 1);
  assert.match(attachments[0].storageKey, new RegExp(`^users/${user.id}/workspaces/default/attachments/${result.noteId}/sample\\.txt$`));
  assert.equal((await repositories.objectStorage.get(attachments[0].storageKey)).toString('utf8'), 'hello world');
  assert.equal(Object.hasOwn(attachments[0], 'contentBase64'), false);
  assert.deepEqual((await repositories.contentRepository.listWorkspaces(user.id)).map((workspace) => workspace.workspaceSlug), ['default']);
  const columns = await repositories.query(
    `select column_name from information_schema.columns
     where table_schema = $1 and table_name in ('kb_notes', 'kb_attachments')`,
    [repositories.schemaName],
  );
  const columnNames = new Set(columns.rows.map((row) => row.column_name));
  assert.equal(columnNames.has('markdown_storage_key'), true);
  assert.equal(columnNames.has('markdown'), false);
  assert.equal(columnNames.has('content_base64'), false);
});

test('ingest fails when the target workspace does not exist', async (t) => {
  const repositories = await createPostgresTestRepositories(t);
  const user = await repositories.createTestUser();

  await assert.rejects(
    () => new IngestEntryUseCase(repositories.contentRepository, repositories.runtimeEnvironmentProvider).execute(payload(), user.id, 'default'),
    /workspace_not_found/,
  );
});

test('manual note creation uses ingest and derives optional reminder from the note', async (t) => {
  const repositories = await createPostgresTestRepositories(t);
  const user = await repositories.createTestUser();
  await repositories.contentRepository.upsertWorkspace(user.id, {
    workspaceSlug: 'default',
    displayName: 'Default',
    whatsappChatJid: '',
    telegramChatId: '',
    githubRepos: [],
    projectSlugs: ['inbox', 'acme-api'],
    createdAt: '2026-04-27T00:00:00.000Z',
    updatedAt: '2026-04-27T00:00:00.000Z',
  });
  await repositories.contentRepository.upsertProject(user.id, {
    projectSlug: 'acme-api',
    displayName: 'Acme API',
    repositories: [],
    workspaceSlug: 'default',
    defaultTags: ['backend'],
    enabled: true,
  });
  const useCase = new CreateManualNoteUseCase(
    repositories.contentRepository,
    new IngestEntryUseCase(repositories.contentRepository, repositories.runtimeEnvironmentProvider),
    repositories.runtimeEnvironmentProvider,
    { dispatch: async () => {} },
  );

  const withoutReminder = await useCase.execute({
    projectSlug: 'acme-api',
    title: 'Nota manual',
    rawText: 'texto da nota',
    tags: ['deploy'],
    reminderDate: '',
    reminderTime: '',
  }, user.id);
  const withReminder = await useCase.execute({
    projectSlug: 'acme-api',
    title: 'Nota com lembrete',
    rawText: 'lembrar deploy',
    tags: [],
    reminderDate: '2026-04-28',
    reminderTime: '09:00',
  }, user.id);

  assert.ok(withoutReminder.noteId);
  assert.equal(withoutReminder.note.type, 'event');
  assert.equal(withoutReminder.note.projectName, 'Acme API');
  assert.equal(withReminder.note.type, 'reminder');
  assert.equal(withReminder.note.hasReminder, true);
  assert.equal(withReminder.note.reminderDate, '2026-04-28');
  assert.equal(withReminder.note.reminderTime, '12:00');
  assert.equal(withReminder.note.reminderAt, '2026-04-28T12:00:00.000Z');
  const notes = await repositories.contentRepository.listNotes(user.id);
  assert.equal(notes.filter((note) => note.type === 'event').length, 2);
  const reminders = await repositories.contentQueryRepository.listReminders(user.id);
  assert.equal(reminders.length, 1);
  assert.equal(reminders[0].id, withReminder.noteId);
  assert.equal(notes.every((note) => note.projectSlug === 'acme-api'), true);
  assert.deepEqual(notes.find((note) => note.id === withoutReminder.noteId)?.tags, ['deploy']);
  assert.deepEqual(notes.find((note) => note.id === withReminder.noteId)?.tags, []);
});
