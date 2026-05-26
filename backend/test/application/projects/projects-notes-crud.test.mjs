import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';

import { encryptConfig } from '../../../dist/application/credentials.js';
import { GithubRepositoryResolutionService } from '../../../dist/application/services/github-repository-resolution.service.js';
import {
  CreateProjectFolderUseCase,
  CreateManualNoteUseCase,
  DeleteNoteUseCase,
  DeleteProjectFolderUseCase,
  DeleteProjectUseCase,
  GetNoteAttachmentContentUseCase,
  GetNoteDetailUseCase,
  IngestEntryUseCase,
  ListProjectTimelineUseCase,
  UpdateNoteUseCase,
  UpdateProjectFolderUseCase,
  UpdateProjectUseCase,
} from '../../../dist/application/use-cases/index.js';
import { createPostgresTestRepositories } from '../../helpers/postgres-test-repositories.mjs';

function runtimeEnvironmentProvider() {
  return {
    read: () => ({
      credentialsEncryptionKey: process.env.KB_CREDENTIALS_ENCRYPTION_KEY || '',
      githubAppId: process.env.KB_GITHUB_APP_ID || '',
      githubAppPrivateKey: process.env.KB_GITHUB_APP_PRIVATE_KEY || '',
    }),
  };
}

function githubIntegrationGateway() {
  return {
    async fetchInstallationRepositories() {
      const response = await fetch('https://api.github.com/installation/repositories?per_page=100');
      if (!response.ok) return [];
      const payload = await response.json();
      return (payload.repositories || []).map((repo) => ({
        id: Number(repo.id || 0),
        fullName: String(repo.full_name || '').trim(),
        name: String(repo.name || '').trim(),
        owner: String(repo.owner?.login || '').trim(),
        private: Boolean(repo.private),
        htmlUrl: String(repo.html_url || '').trim(),
        description: repo.description == null ? null : String(repo.description),
        defaultBranch: repo.default_branch == null ? null : String(repo.default_branch),
      }));
    },
  };
}

async function seedProject(repositories, userId) {
  await repositories.contentRepository.upsertWorkspace(userId, {
    workspaceSlug: 'default',
    displayName: 'Default',
    whatsappChatJid: '',
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
    folderId: null,
    status: 'active',
    tags: ['deploy'],
    occurredAt: '2026-04-27T10:00:00.000Z',
    sourceChannel: 'external',
    summary: 'confirmar deploy',
    markdown: '# Deploy antigo\n\n## Summary\n\nconfirmar deploy\n',
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

  const noopDispatcher = { dispatch: async () => {} };
  const useCase = new UpdateNoteUseCase(repositories.contentRepository, repositories.runtimeEnvironmentProvider, undefined, noopDispatcher);
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
  assert.equal(updated?.metadata.reminderTime, '13:15');
  assert.equal(updated?.metadata.reminderAt, '2026-05-01T13:15:00.000Z');
});

test('creates and updates manual decisions as canonical note types', async (t) => {
  const repositories = await createPostgresTestRepositories(t);
  const user = await repositories.createTestUser();
  await seedProject(repositories, user.id);

  const ingest = new IngestEntryUseCase(repositories.contentRepository, repositories.runtimeEnvironmentProvider);
  const noopDispatcher = { dispatch: async () => {} };
  const createNote = new CreateManualNoteUseCase(
    repositories.contentRepository,
    ingest,
    repositories.runtimeEnvironmentProvider,
    noopDispatcher,
  );
  const created = await createNote.execute({
    projectSlug: 'platform',
    title: 'Choose queue provider',
    rawText: 'Use Postgres queue for v1',
    tags: ['architecture'],
    canonicalType: 'decision',
    reminderDate: '',
    reminderTime: '',
  }, user.id);

  const note = await repositories.contentRepository.getNoteById(user.id, created.noteId);
  assert.equal(note?.type, 'decision');
  assert.equal(note?.frontmatter.type, 'decision');

  await new UpdateNoteUseCase(repositories.contentRepository, repositories.runtimeEnvironmentProvider, undefined, noopDispatcher).execute({
    id: created.noteId,
    title: 'Choose queue provider',
    rawText: 'Move this back to a regular event',
    tags: ['architecture'],
    canonicalType: 'event',
    reminderDate: '',
    reminderTime: '',
  }, user.id);

  const updated = await repositories.contentRepository.getNoteById(user.id, created.noteId);
  assert.equal(updated?.type, 'event');
  assert.equal(updated?.frontmatter.type, 'event');
});

test('lists project timeline by derived category without raw webhook events', async (t) => {
  const repositories = await createPostgresTestRepositories(t);
  const user = await repositories.createTestUser();
  await seedProject(repositories, user.id);
  const folder = await repositories.contentRepository.upsertProjectFolder(user.id, {
    workspaceSlug: 'default',
    projectSlug: 'platform',
    parentFolderId: null,
    displayName: 'Release',
    folderSlug: 'release',
    fullSlugPath: 'release',
  });

  await repositories.contentRepository.upsertNote(user.id, {
    path: '20 Inbox/platform/2026/05/whatsapp.md',
    type: 'event',
    title: 'WhatsApp update',
    projectSlug: 'platform',
    workspaceSlug: 'default',
    folderId: null,
    status: 'active',
    tags: [],
    occurredAt: '2026-05-05T10:00:00.000Z',
    sourceChannel: 'whatsapp',
    summary: 'from chat',
    markdown: '# WhatsApp update',
    frontmatter: {},
    metadata: {},
    origin: 'postgres',
    source: 'evolution',
    links: [],
  });
  await repositories.contentRepository.upsertNote(user.id, {
    path: '20 Inbox/platform/2026/05/github.md',
    type: 'event',
    title: 'GitHub push',
    projectSlug: 'platform',
    workspaceSlug: 'default',
    folderId: folder.id,
    status: 'active',
    tags: [],
    occurredAt: '2026-05-04T10:00:00.000Z',
    sourceChannel: 'github-push',
    summary: 'push received',
    markdown: '# GitHub push',
    frontmatter: {},
    metadata: {},
    origin: 'postgres',
    source: 'github-push',
    links: [],
  });
  await repositories.contentRepository.upsertNote(user.id, {
    path: '20 Inbox/platform/2026/05/manual.md',
    type: 'event',
    title: 'Manual note',
    projectSlug: 'platform',
    workspaceSlug: 'default',
    folderId: null,
    status: 'active',
    tags: [],
    occurredAt: '2026-05-03T10:00:00.000Z',
    sourceChannel: 'external',
    summary: 'manual',
    markdown: '# Manual note',
    frontmatter: {},
    metadata: { manual: true },
    origin: 'postgres',
    source: 'manual-api',
    links: [],
  });
  await repositories.contentRepository.upsertNote(user.id, {
    path: '20 Inbox/platform/2026/05/reminder.md',
    type: 'event',
    title: 'Reminder note',
    projectSlug: 'platform',
    workspaceSlug: 'default',
    folderId: null,
    status: 'pending',
    tags: [],
    occurredAt: '2026-05-02T10:00:00.000Z',
    sourceChannel: 'external',
    summary: 'remind me',
    markdown: '# Reminder note',
    frontmatter: {},
    metadata: { reminderDate: '2026-05-20' },
    origin: 'postgres',
    source: 'manual-api',
    links: [],
  });
  await repositories.contentRepository.upsertNote(user.id, {
    path: '30 Knowledge/platform/2026/05/decision.md',
    type: 'decision',
    title: 'Decision note',
    projectSlug: 'platform',
    workspaceSlug: 'default',
    folderId: null,
    status: 'active',
    tags: [],
    occurredAt: '2026-05-01T10:00:00.000Z',
    sourceChannel: 'external',
    summary: 'decision',
    markdown: '# Decision note',
    frontmatter: {},
    metadata: { manual: true, reminderDate: '2026-05-21' },
    origin: 'postgres',
    source: 'manual-api',
    links: [],
  });

  const useCase = new ListProjectTimelineUseCase(repositories.contentRepository);
  const all = await useCase.execute(user.id, { projectSlug: 'platform', page: 1, pageSize: 10, category: 'all' });
  assert.deepEqual(all.items.map((item) => item.category), ['whatsapp', 'github-push', 'manual', 'reminder', 'decision']);

  const allProjects = await useCase.execute(user.id, { page: 1, pageSize: 10, category: 'all' });
  assert.deepEqual(allProjects.items.map((item) => item.category), ['whatsapp', 'github-push', 'manual', 'reminder', 'decision']);

  const nestedFolder = await repositories.contentRepository.upsertProjectFolder(user.id, {
    workspaceSlug: 'default',
    projectSlug: 'platform',
    parentFolderId: folder.id,
    displayName: 'Release QA',
    folderSlug: 'release-qa',
    fullSlugPath: 'release/release-qa',
  });
  await repositories.contentRepository.upsertNote(user.id, {
    path: '30 Knowledge/platform/2026/05/release-qa.md',
    type: 'event',
    title: 'Release QA checklist',
    projectSlug: 'platform',
    workspaceSlug: 'default',
    folderId: nestedFolder.id,
    status: 'active',
    tags: [],
    occurredAt: '2026-05-06T10:00:00.000Z',
    sourceChannel: 'external',
    summary: 'qa details',
    markdown: '# Release QA checklist',
    frontmatter: {},
    metadata: { manual: true },
    origin: 'postgres',
    source: 'manual-api',
    links: [],
  });

  const root = await useCase.execute(user.id, { projectSlug: 'platform', folderId: '', page: 1, pageSize: 10, category: 'all' });
  assert.deepEqual(root.items.map((item) => item.title), ['Release QA checklist', 'WhatsApp update', 'GitHub push', 'Manual note', 'Reminder note', 'Decision note']);

  const releaseFolder = await useCase.execute(user.id, { projectSlug: 'platform', folderId: folder.id, page: 1, pageSize: 10, category: 'all' });
  assert.deepEqual(releaseFolder.items.map((item) => item.title), ['Release QA checklist', 'GitHub push']);

  const reminders = await useCase.execute(user.id, { projectSlug: 'platform', page: 1, pageSize: 10, category: 'reminder' });
  assert.deepEqual(reminders.items.map((item) => item.title), ['Reminder note']);

  const decisions = await useCase.execute(user.id, { projectSlug: 'platform', page: 1, pageSize: 10, category: 'decision' });
  assert.deepEqual(decisions.items.map((item) => item.title), ['Decision note']);
});

test('clears manual note reminder metadata', async (t) => {
  const repositories = await createPostgresTestRepositories(t);
  const user = await repositories.createTestUser();
  await seedProject(repositories, user.id);
  const { note } = await seedManualNote(repositories, user.id);

  const useCase = new UpdateNoteUseCase(repositories.contentRepository, repositories.runtimeEnvironmentProvider, undefined, { dispatch: async () => {} });
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

  await new DeleteNoteUseCase(repositories.contentRepository, undefined, { dispatch: async () => {} }).execute(note.id, user.id);
  assert.equal(await repositories.contentRepository.getNoteById(user.id, note.id), null);
  assert.equal((await repositories.contentRepository.listAttachments(user.id, note.id)).length, 0);
  assert.equal(repositories.objectStorage.deletedKeys.includes(note.markdownStorageKey), true);
  assert.equal(repositories.objectStorage.deletedKeys.includes(attachments[0].storageKey), true);
  assert.equal((await repositories.contentQueryRepository.listReminders(user.id)).length, 0);
});

test('note list and detail expose attachment metadata without storage internals', async (t) => {
  const previousPublicBaseUrl = process.env.KB_PUBLIC_BASE_URL;
  const previousApiPublicBaseUrl = process.env.KB_API_PUBLIC_BASE_URL;
  process.env.KB_PUBLIC_BASE_URL = 'https://kb.example.com/knowledge-base';
  process.env.KB_API_PUBLIC_BASE_URL = 'https://kb.example.com/knowledge-base/api';
  t.after(() => {
    if (previousPublicBaseUrl === undefined) delete process.env.KB_PUBLIC_BASE_URL;
    else process.env.KB_PUBLIC_BASE_URL = previousPublicBaseUrl;
    if (previousApiPublicBaseUrl === undefined) delete process.env.KB_API_PUBLIC_BASE_URL;
    else process.env.KB_API_PUBLIC_BASE_URL = previousApiPublicBaseUrl;
  });
  const repositories = await createPostgresTestRepositories(t);
  const user = await repositories.createTestUser();
  await seedProject(repositories, user.id);
  const { note } = await seedManualNote(repositories, user.id);
  const second = await repositories.contentRepository.upsertNote(user.id, {
    path: '20 Inbox/platform/2026/04/note-2.md',
    type: 'event',
    title: 'Nota com um anexo',
    projectSlug: 'platform',
    workspaceSlug: 'default',
    folderId: null,
    status: 'active',
    tags: [],
    occurredAt: '2026-04-28T10:00:00.000Z',
    sourceChannel: 'external',
    summary: 'um anexo',
    markdown: '# Nota com um anexo',
    frontmatter: {},
    metadata: {},
    origin: 'postgres',
    source: 'manual-api',
    links: [],
  });
  const third = await repositories.contentRepository.upsertNote(user.id, {
    path: '20 Inbox/platform/2026/04/note-3.md',
    type: 'event',
    title: 'Nota sem anexo',
    projectSlug: 'platform',
    workspaceSlug: 'default',
    folderId: null,
    status: 'active',
    tags: [],
    occurredAt: '2026-04-29T10:00:00.000Z',
    sourceChannel: 'external',
    summary: 'sem anexo',
    markdown: '# Nota sem anexo',
    frontmatter: {},
    metadata: {},
    origin: 'postgres',
    source: 'manual-api',
    links: [],
  });

  await repositories.contentRepository.saveAttachment(user.id, {
    noteId: note.id,
    fileName: 'image.png',
    mimeType: 'image/png',
    sizeBytes: 5,
    dataBase64: Buffer.from('image').toString('base64'),
    checksumSha256: 'checksum-1',
    metadata: {},
  });
  await repositories.contentRepository.saveAttachment(user.id, {
    noteId: note.id,
    fileName: 'doc.pdf',
    mimeType: 'application/pdf',
    sizeBytes: 3,
    dataBase64: Buffer.from('pdf').toString('base64'),
    checksumSha256: 'checksum-2',
    metadata: {},
  });
  await repositories.contentRepository.saveAttachment(user.id, {
    noteId: second.id,
    fileName: 'one.txt',
    mimeType: 'text/plain',
    sizeBytes: 3,
    dataBase64: Buffer.from('one').toString('base64'),
    checksumSha256: 'checksum-3',
    metadata: {},
  });

  const page = await repositories.contentRepository.listNotesPage(user.id, { page: 1, pageSize: 10, projectSlug: 'platform' });
  const counts = new Map(page.items.map((item) => [item.id, item.attachmentCount]));
  assert.equal(counts.get(note.id), 2);
  assert.equal(counts.get(second.id), 1);
  assert.equal(counts.get(third.id), 0);

  const detail = await new GetNoteDetailUseCase(repositories.contentRepository).execute(user.id, note.id);
  assert.equal(detail.attachmentCount, 2);
  assert.equal(detail.attachments.length, 2);
  assert.deepEqual(Object.keys(detail.attachments[0]).sort(), ['fileName', 'id', 'mimeType', 'sizeBytes', 'url']);
  assert.match(detail.attachments[0].url, new RegExp(`^https://kb\\.example\\.com/knowledge-base/api/notes/${note.id}/attachments/.+/content$`));
  assert.equal(Object.hasOwn(detail.attachments[0], 'storageKey'), false);
  assert.equal(Object.hasOwn(detail.attachments[0], 'dataBase64'), false);
});

test('note pagination filters by note status', async (t) => {
  const repositories = await createPostgresTestRepositories(t);
  const user = await repositories.createTestUser();
  await seedProject(repositories, user.id);

  await repositories.contentRepository.upsertNote(user.id, {
    path: '20 Inbox/platform/2026/04/active.md',
    type: 'event',
    title: 'Nota ativa',
    projectSlug: 'platform',
    workspaceSlug: 'default',
    folderId: null,
    status: 'active',
    tags: [],
    occurredAt: '2026-04-30T10:00:00.000Z',
    sourceChannel: 'external',
    summary: 'ativa',
    markdown: '# Nota ativa',
    frontmatter: {},
    metadata: {},
    origin: 'postgres',
    source: 'manual-api',
    links: [],
  });
  await repositories.contentRepository.upsertNote(user.id, {
    path: '20 Inbox/platform/2026/04/resolved.md',
    type: 'event',
    title: 'Nota resolvida',
    projectSlug: 'platform',
    workspaceSlug: 'default',
    folderId: null,
    status: 'resolved',
    tags: [],
    occurredAt: '2026-04-29T10:00:00.000Z',
    sourceChannel: 'external',
    summary: 'resolvida',
    markdown: '# Nota resolvida',
    frontmatter: {},
    metadata: {},
    origin: 'postgres',
    source: 'manual-api',
    links: [],
  });

  const page = await repositories.contentRepository.listNotesPage(user.id, {
    page: 1,
    pageSize: 10,
    projectSlug: 'platform',
    status: 'resolved',
  });

  assert.deepEqual(page.items.map((item) => item.title), ['Nota resolvida']);
});

test('note attachment content use case returns bytes and blocks unrelated attachments', async (t) => {
  const repositories = await createPostgresTestRepositories(t);
  const user = await repositories.createTestUser();
  const otherUser = await repositories.createTestUser();
  await seedProject(repositories, user.id);
  await seedProject(repositories, otherUser.id);
  const { note } = await seedManualNote(repositories, user.id);
  const { note: otherNote } = await seedManualNote(repositories, otherUser.id);
  const attachment = await repositories.contentRepository.saveAttachment(user.id, {
    noteId: note.id,
    fileName: 'evidence.txt',
    mimeType: 'text/plain',
    sizeBytes: 11,
    dataBase64: Buffer.from('hello world').toString('base64'),
    checksumSha256: 'checksum',
    metadata: {},
  });
  const otherAttachment = await repositories.contentRepository.saveAttachment(otherUser.id, {
    noteId: otherNote.id,
    fileName: 'other.txt',
    mimeType: 'text/plain',
    sizeBytes: 5,
    dataBase64: Buffer.from('other').toString('base64'),
    checksumSha256: 'other-checksum',
    metadata: {},
  });
  const useCase = new GetNoteAttachmentContentUseCase(repositories.contentRepository, repositories.objectStorage);

  const content = await useCase.execute(user.id, note.id, attachment.id);

  assert.equal(content.fileName, 'evidence.txt');
  assert.equal(content.mimeType, 'text/plain');
  assert.equal(content.sizeBytes, 11);
  assert.equal(content.body.toString('utf8'), 'hello world');
  assert.equal(await useCase.execute(user.id, note.id, otherAttachment.id), null);
  assert.equal(await useCase.execute(user.id, otherNote.id, otherAttachment.id), null);
});

test('updates any note type and still blocks project deletion while notes exist', async (t) => {
  const repositories = await createPostgresTestRepositories(t);
  const user = await repositories.createTestUser();
  await seedProject(repositories, user.id);
  const reviewNote = await repositories.contentRepository.upsertNote(user.id, {
    path: '20 Inbox/platform/review.md',
    type: 'event',
    title: 'Review',
    projectSlug: 'platform',
    workspaceSlug: 'default',
    folderId: null,
    status: 'active',
    tags: [],
    occurredAt: '2026-04-27T10:00:00.000Z',
    sourceChannel: 'github-push',
    summary: 'Push recebido sem analise de IA configurada.',
    markdown: [
      '# Review',
      '',
      'Project: Platform',
      '',
      '## Original text',
      '',
      'Push recebido sem analise de IA configurada.',
      '',
      '## Summary',
      '',
      'Push recebido sem analise de IA configurada.',
      '',
      '## Impact',
      '',
      'Nenhum impacto adicional foi resumido.',
      '',
      '## Risks',
      '',
      '- none',
      '',
      '## Next steps',
      '',
      '- none',
      '',
      '## Findings de review',
      '',
      'No findings registered.',
      '',
    ].join('\n'),
    frontmatter: { id: 'review:1' },
    metadata: { manual: false },
    origin: 'postgres',
    source: 'github-push',
    links: [],
  });

  const noopDispatcher = { dispatch: async () => {} };
  const result = await new UpdateNoteUseCase(repositories.contentRepository, repositories.runtimeEnvironmentProvider, undefined, noopDispatcher).execute({
    id: reviewNote.id,
    title: 'Review atualizada',
    rawText: 'texto atualizado',
    tags: ['review'],
    reminderDate: '2026-05-02',
    reminderTime: '08:45',
    reminderAt: '2026-05-02T08:45:00.000Z',
  }, user.id);

  assert.equal(result.ok, true);
  const updated = await repositories.contentRepository.getNoteById(user.id, reviewNote.id);
  assert.equal(updated?.title, 'Review atualizada');
  assert.deepEqual(updated?.tags, ['review']);
  assert.equal(updated?.metadata.rawText, 'texto atualizado');
  assert.equal(updated?.metadata.reminderDate, '2026-05-02');
  assert.match((await repositories.objectStorage.get(updated.markdownStorageKey)).toString('utf8'), /texto atualizado/);
  assert.match((await repositories.objectStorage.get(updated.markdownStorageKey)).toString('utf8'), /## Summary/);
  assert.match((await repositories.objectStorage.get(updated.markdownStorageKey)).toString('utf8'), /## Findings de review/);
  assert.equal(updated?.summary, 'Push recebido sem analise de IA configurada.');
  const detail = await new GetNoteDetailUseCase(repositories.contentRepository).execute(user.id, reviewNote.id);
  assert.equal(detail?.editor?.canDelete, true);
  assert.equal(detail?.editor?.rawText, 'texto atualizado');

  await assert.rejects(() => new DeleteProjectUseCase(repositories.contentRepository).execute('platform', user.id));
  await new DeleteNoteUseCase(repositories.contentRepository, undefined, noopDispatcher).execute(reviewNote.id, user.id);
  assert.equal(await repositories.contentRepository.getNoteById(user.id, reviewNote.id), null);
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
    encryptedConfig: encryptConfig({ installationId: '42', accountLogin: 'acme' }, repositories.runtimeEnvironmentProvider),
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

  const githubRepositoryResolution = new GithubRepositoryResolutionService(
    repositories.contentRepository,
    repositories.credentialRepository,
    runtimeEnvironmentProvider(),
    githubIntegrationGateway(),
  );
  const result = await new UpdateProjectUseCase(repositories.contentRepository, githubRepositoryResolution).execute({
    projectSlug: 'platform',
    displayName: 'Platform Core',
    repositoryIds: ['102'],
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

test('folders organize manual notes and update derived note paths on rename', async (t) => {
  const repositories = await createPostgresTestRepositories(t);
  const user = await repositories.createTestUser();
  await seedProject(repositories, user.id);
  const { note } = await seedManualNote(repositories, user.id);

  const createFolder = new CreateProjectFolderUseCase(repositories.contentRepository);
  const updateFolder = new UpdateProjectFolderUseCase(repositories.contentRepository);
  const deleteFolder = new DeleteProjectFolderUseCase(repositories.contentRepository);
  const updateNote = new UpdateNoteUseCase(repositories.contentRepository, repositories.runtimeEnvironmentProvider, undefined, { dispatch: async () => {} });

  const opsFolder = (await createFolder.execute({ projectSlug: 'platform', displayName: 'Ops' }, user.id)).folder;
  const runbooksFolder = (await createFolder.execute({ projectSlug: 'platform', displayName: 'Runbooks', parentFolderId: opsFolder.id }, user.id)).folder;
  await assert.rejects(() => createFolder.execute({ projectSlug: 'platform', displayName: 'Runbooks', parentFolderId: opsFolder.id }, user.id));

  await updateNote.execute({
    id: note.id,
    folderId: runbooksFolder.id,
    title: 'Deploy runbook',
    rawText: 'validar deploy final',
    tags: ['ops'],
    reminderDate: '',
    reminderTime: '',
  }, user.id);

  const movedDetail = await repositories.contentRepository.getNoteById(user.id, note.id);
  assert.equal(movedDetail?.folderId, runbooksFolder.id);
  assert.match(movedDetail?.path || '', /20 Inbox\/platform\/ops\/runbooks\/2026\/04\/note\.md$/);
  assert.equal(repositories.objectStorage.deletedKeys.includes(note.markdownStorageKey), true);

  await updateFolder.execute({
    projectSlug: 'platform',
    folderId: opsFolder.id,
    displayName: 'Platform Ops',
    parentFolderId: undefined,
  }, user.id);

  const renamedDetail = await repositories.contentRepository.getNoteById(user.id, note.id);
  assert.match(renamedDetail?.path || '', /20 Inbox\/platform\/platform-ops\/runbooks\/2026\/04\/note\.md$/);
  await assert.rejects(() => deleteFolder.execute('platform', opsFolder.id, user.id));

  const archiveFolder = (await createFolder.execute({ projectSlug: 'platform', displayName: 'Archive' }, user.id)).folder;
  const deleted = await deleteFolder.execute('platform', archiveFolder.id, user.id);
  assert.equal(deleted.ok, true);
});
