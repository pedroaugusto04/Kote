import test from 'node:test';
import assert from 'node:assert/strict';

import { createMemoryRepositories } from '../../dist/infrastructure/repositories/memory-repositories.js';
import { CreateManualNoteUseCase, IngestEntryUseCase } from '../../dist/application/use-cases/index.js';

function payload() {
  return {
    schemaVersion: 1,
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

test('ingest persists event note, reminder note, attachment and workspace in repository', async () => {
  const repositories = createMemoryRepositories();
  await repositories.contentRepository.upsertWorkspace('user-1', {
    workspaceSlug: 'default',
    displayName: 'Default',
    whatsappGroupJid: '',
    telegramChatId: '',
    githubRepos: [],
    projectSlugs: ['inbox'],
    createdAt: '2026-04-27T00:00:00.000Z',
    updatedAt: '2026-04-27T00:00:00.000Z',
  });
  const result = await new IngestEntryUseCase(repositories.contentRepository).execute(payload(), 'user-1', 'default');

  assert.equal(result.ok, true);
  assert.match(result.eventPath, /^20 Inbox\/n8n-automations\//);
  assert.match(result.reminderPath, /^60 Reminders\/n8n-automations\//);
  assert.equal(result.attachmentIds.length, 1);
  assert.ok(result.reminderNoteId);

  const notes = await repositories.contentRepository.listNotes('user-1');
  assert.equal(notes.filter((note) => note.type === 'event').length, 1);
  assert.equal(notes.filter((note) => note.type === 'reminder').length, 1);
  assert.equal((await repositories.contentRepository.listAttachments('user-1', result.noteId)).length, 1);
  assert.deepEqual((await repositories.contentRepository.listWorkspaces('user-1')).map((workspace) => workspace.workspaceSlug), ['default']);
});

test('ingest fails when the target workspace does not exist', async () => {
  const repositories = createMemoryRepositories();

  await assert.rejects(
    () => new IngestEntryUseCase(repositories.contentRepository).execute(payload(), 'user-1', 'default'),
    /workspace_not_found/,
  );
});

test('manual note creation uses ingest and creates optional reminder', async () => {
  const repositories = createMemoryRepositories();
  await repositories.contentRepository.upsertWorkspace('user-1', {
    workspaceSlug: 'default',
    displayName: 'Default',
    whatsappGroupJid: '',
    telegramChatId: '',
    githubRepos: [],
    projectSlugs: ['inbox', 'acme-api'],
    createdAt: '2026-04-27T00:00:00.000Z',
    updatedAt: '2026-04-27T00:00:00.000Z',
  });
  await repositories.contentRepository.upsertProject('user-1', {
    projectSlug: 'acme-api',
    displayName: 'Acme API',
    repoFullName: '',
    workspaceSlug: 'default',
    aliases: [],
    defaultTags: ['backend'],
    enabled: true,
  });
  const useCase = new CreateManualNoteUseCase(
    repositories.contentRepository,
    new IngestEntryUseCase(repositories.contentRepository),
  );

  const withoutReminder = await useCase.execute({
    projectSlug: 'acme-api',
    title: 'Nota manual',
    rawText: 'texto da nota',
    tags: ['deploy'],
    reminderDate: '',
    reminderTime: '',
  }, 'user-1');
  const withReminder = await useCase.execute({
    projectSlug: 'acme-api',
    title: 'Nota com lembrete',
    rawText: 'lembrar deploy',
    tags: [],
    reminderDate: '2026-04-28',
    reminderTime: '09:00',
  }, 'user-1');

  assert.ok(withoutReminder.noteId);
  assert.equal(withoutReminder.reminderNoteId, '');
  assert.ok(withReminder.reminderNoteId);
  const notes = await repositories.contentRepository.listNotes('user-1');
  assert.equal(notes.filter((note) => note.type === 'event').length, 2);
  assert.equal(notes.filter((note) => note.type === 'reminder').length, 1);
  assert.equal(notes.every((note) => note.projectSlug === 'acme-api'), true);
  assert.equal(notes.some((note) => note.tags.includes('backend')), true);
});
