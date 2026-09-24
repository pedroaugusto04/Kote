import test from 'node:test';
import assert from 'node:assert/strict';
import zlib from 'node:zlib';

import { ExportGlobalUseCase } from '../../dist/application/use-cases/export-global.use-case.js';

function readZipEntries(buffer) {
  const entries = new Map();
  let offset = 0;
  while (offset + 30 <= buffer.length && buffer.readUInt32LE(offset) === 0x04034b50) {
    const method = buffer.readUInt16LE(offset + 8);
    const compressedSize = buffer.readUInt32LE(offset + 18);
    const nameLength = buffer.readUInt16LE(offset + 26);
    const extraLength = buffer.readUInt16LE(offset + 28);
    const nameStart = offset + 30;
    const name = buffer.toString('utf8', nameStart, nameStart + nameLength);
    const dataStart = nameStart + nameLength + extraLength;
    const data = buffer.subarray(dataStart, dataStart + compressedSize);
    entries.set(name, method === 8 ? zlib.inflateRawSync(data) : data);
    offset = dataStart + compressedSize;
  }
  return entries;
}

function note(id, workspaceSlug, projectSlug) {
  return {
    id,
    path: `${id}.md`,
    categories: [{ id: 'cat-1', name: 'Architecture' }],
    title: `Note ${id}`,
    projectId: `${projectSlug}-id`,
    workspaceId: `${workspaceSlug}-id`,
    workspaceSlug,
    projectSlug,
    folderId: null,
    status: 'active',
    tags: ['portable'],
    occurredAt: '2026-09-28T10:00:00.000Z',
    sourceChannel: 'manual',
    summary: '',
    markdown: `# ${id}\n\nOriginal body`,
    markdownStorageKey: '',
    metadata: { custom: true },
    source: 'manual',
    sessionId: 'session-1',
    reminderAt: '',
    isPinned: true,
    createdAt: '2026-09-28T10:00:00.000Z',
    updatedAt: '2026-09-28T10:00:00.000Z',
  };
}

function createUseCase({
  notes = [note('note-1', 'alpha', 'one')],
  objectStorageGet = async () => Buffer.from('attachment'),
  hydrateMarkdown = async (value) => value,
} = {}) {
  const workspaces = [
    { id: 'alpha-id', userId: 'user-1', workspaceSlug: 'alpha', displayName: 'Alpha', dependencyWatcherEnabled: false, createdAt: '', updatedAt: '' },
    { id: 'beta-id', userId: 'user-1', workspaceSlug: 'beta', displayName: 'Beta', dependencyWatcherEnabled: true, createdAt: '', updatedAt: '' },
  ];
  const projects = [
    { id: 'one-id', projectSlug: 'one', displayName: 'One', workspaceId: 'alpha-id', workspaceSlug: 'alpha', enabled: false, favorite: true, defaultTags: ['portable'], repositories: [{ id: 'repo-1' }] },
    { id: 'two-id', projectSlug: 'two', displayName: 'Two', workspaceId: 'beta-id', workspaceSlug: 'beta', enabled: true, favorite: false, defaultTags: [], repositories: [] },
  ];
  const attachment = {
    id: 'attachment-1', userId: 'user-1', noteId: 'note-1', fileName: 'original.txt', mimeType: 'text/plain',
    sizeBytes: 10, storageKey: 'attachments/key', checksumSha256: '', createdAt: '2026-09-28T10:00:00.000Z',
  };
  const contentRepository = {
    async listWorkspaces() { return workspaces; },
    async listProjectsForExport() { return projects; },
    async listNotes() { return notes; },
    async listAttachmentsForExport() { return [attachment]; },
    async listProjectFolders(_userId, project) { return project === 'one-id' ? [{ id: 'folder-1', projectId: 'one-id', displayName: 'Docs' }] : []; },
    async listCategories(_userId, workspaceId) { return [{ id: `category-${workspaceId}`, workspaceId, name: 'Architecture' }]; },
    async listRepositories(_userId, workspaceId) { return workspaceId === 'alpha-id' ? [{ id: 'repo-1', workspaceId, fullName: 'org/repo' }] : []; },
    async listNoteLinksByNoteIds() { return [{ id: 'link-1', userId: 'user-1', noteId: 'note-1', target: 'src/index.ts', metadata: {}, createdAt: '' }]; },
  };
  const contentObjectStorage = { hydrateMarkdown };
  const objectStorage = { get: objectStorageGet };
  return new ExportGlobalUseCase(contentRepository, contentObjectStorage, objectStorage);
}

test('global export includes readable workspace, note and attachment information', async () => {
  const useCase = createUseCase();
  const result = await useCase.execute('user-1');
  const entries = readZipEntries(result.buffer);
  const manifest = JSON.parse(entries.get('manifest.json').toString('utf8'));
  const projects = JSON.parse(entries.get('data/projects.json').toString('utf8'));
  const notes = JSON.parse(entries.get('data/notes.json').toString('utf8'));
  const attachments = JSON.parse(entries.get('data/attachments.json').toString('utf8'));

  assert.match(result.filename, /^kote-export-\d{4}-\d{2}-\d{2}\.zip$/);
  assert.deepEqual(manifest.counts, { workspaces: 2, projects: 2, folders: 1, categories: 2, repositories: 1, notes: 1, noteLinks: 1, attachments: 1 });
  assert.deepEqual(manifest.skipped, []);
  assert.deepEqual(manifest.identifiers.projects[0], { id: 'one-id', slug: 'one', workspaceId: 'alpha-id' });
  assert.equal(projects[0].status, 'Inactive');
  assert.equal(projects[0].workspace, 'Alpha');
  assert.deepEqual(notes[0].categories, ['Architecture']);
  assert.deepEqual(notes[0].customFields, { custom: true });
  assert.equal(notes[0].id, undefined);
  assert.equal(notes[0].markdownStorageKey, undefined);
  assert.equal(entries.get('INDEX.md').toString('utf8').includes('[Note note-1]'), true);
  assert.equal(entries.get('notes/alpha/one/note-note-1.md').toString('utf8'), '# note-1\n\nOriginal body');
  assert.equal(entries.get('attachments/alpha/one/note-note-1/original.txt').toString('utf8'), 'attachment');
  assert.equal(attachments[0].name, 'original.txt');
  assert.equal(attachments[0].note, 'notes/alpha/one/note-note-1.md');
  assert.equal(attachments[0].storageKey, undefined);
  assert.deepEqual(JSON.parse(entries.get('data/note-links.json').toString('utf8')), [{
    note: 'notes/alpha/one/note-note-1.md',
    reference: 'src/index.ts',
    createdAt: '',
  }]);
  assert.equal(manifest.files.attachments[0].sha256, '602a5e69c3021bdbd3d25156a02d2cbb467605b8203248eea6af3fb42168d663');
});

test('global export uses readable note names and disambiguates duplicate titles', async () => {
  const notes = [
    { ...note('note-b', 'alpha', 'one'), title: 'Deploy API' },
    { ...note('note-a', 'alpha', 'one'), title: 'Deploy API' },
  ];
  const useCase = createUseCase({ notes });
  const result = await useCase.execute('user-1');
  const entries = readZipEntries(result.buffer);
  const manifest = JSON.parse(entries.get('manifest.json').toString('utf8'));

  assert.equal(entries.has('notes/alpha/one/deploy-api.md'), true);
  assert.equal(entries.has('notes/alpha/one/deploy-api-2.md'), true);
  assert.deepEqual(manifest.files.notes.map((file) => file.path).sort(), [
    'notes/alpha/one/deploy-api-2.md',
    'notes/alpha/one/deploy-api.md',
  ]);
});

test('global export works beyond the project export note limit', async () => {
  const notes = Array.from({ length: 5001 }, (_, index) => note(`note-${index + 1}`, 'alpha', 'one'));
  const useCase = createUseCase({ notes });
  const result = await useCase.execute('user-1');
  const manifest = JSON.parse(readZipEntries(result.buffer).get('manifest.json').toString('utf8'));
  assert.equal(manifest.counts.notes, 5001);
});

test('global export skips unavailable Markdown and records the reason in the manifest', async () => {
  const useCase = createUseCase({
    notes: [{ ...note('note-1', 'alpha', 'one'), markdown: '', markdownStorageKey: 'missing-key' }],
    hydrateMarkdown: async () => { throw new Error('object_storage_content_missing:missing-key'); },
  });
  const result = await useCase.execute('user-1');
  const entries = readZipEntries(result.buffer);
  const manifest = JSON.parse(entries.get('manifest.json').toString('utf8'));

  assert.equal(manifest.counts.notes, 0);
  assert.equal(manifest.counts.noteLinks, 0);
  assert.deepEqual(manifest.skipped, [{
    kind: 'note',
    id: 'note-1',
    storageKey: 'missing-key',
    reason: 'object_storage_content_missing:missing-key',
  }]);
  assert.equal(entries.has('data/notes.json'), true);
});

test('global export skips unavailable attachments and records the reason in the manifest', async () => {
  const useCase = createUseCase({
    objectStorageGet: async () => { throw new Error('object_storage_content_missing:attachment-key'); },
  });
  const result = await useCase.execute('user-1');
  const manifest = JSON.parse(readZipEntries(result.buffer).get('manifest.json').toString('utf8'));

  assert.equal(manifest.counts.attachments, 0);
  assert.deepEqual(manifest.skipped, [{
    kind: 'attachment',
    id: 'attachment-1',
    noteId: 'note-1',
    storageKey: 'attachments/key',
    reason: 'object_storage_content_missing:attachment-key',
  }]);
});

test('global export skips a note with no Markdown storage reference', async () => {
  const useCase = createUseCase({
    notes: [{ ...note('legacy-note', 'alpha', 'one'), markdown: '', markdownStorageKey: '' }],
  });
  const result = await useCase.execute('user-1');
  const manifest = JSON.parse(readZipEntries(result.buffer).get('manifest.json').toString('utf8'));

  assert.equal(manifest.counts.notes, 0);
  assert.deepEqual(manifest.skipped, [{
    kind: 'note',
    id: 'legacy-note',
    reason: 'missing_markdown_storage_key',
  }]);
});

test('global export bounds concurrent Markdown hydration', async () => {
  let active = 0;
  let maximumActive = 0;
  const notes = Array.from({ length: 40 }, (_, index) => ({
    ...note(`note-${index + 1}`, 'alpha', 'one'),
    markdown: '',
    markdownStorageKey: `notes/${index + 1}`,
  }));
  const useCase = createUseCase({
    notes,
    hydrateMarkdown: async (value) => {
      active += 1;
      maximumActive = Math.max(maximumActive, active);
      await new Promise((resolve) => setTimeout(resolve, 2));
      active -= 1;
      return { ...value, markdown: `# ${value.id}` };
    },
  });

  await useCase.execute('user-1');
  assert.ok(maximumActive <= 16, `expected at most 16 concurrent reads, got ${maximumActive}`);
});
