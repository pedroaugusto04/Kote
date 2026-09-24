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

function createUseCase({ notes = [note('note-1', 'alpha', 'one')], objectStorageGet = async () => Buffer.from('attachment') } = {}) {
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
  const contentObjectStorage = { async hydrateMarkdown(value) { return value; } };
  const objectStorage = { get: objectStorageGet };
  return new ExportGlobalUseCase(contentRepository, contentObjectStorage, objectStorage);
}

test('global export includes all workspaces, disabled projects, stable note files, metadata and attachments', async () => {
  const useCase = createUseCase();
  const result = await useCase.execute('user-1');
  const entries = readZipEntries(result.buffer);
  const manifest = JSON.parse(entries.get('manifest.json').toString('utf8'));
  const projects = JSON.parse(entries.get('data/projects.json').toString('utf8'));
  const notes = JSON.parse(entries.get('data/notes.json').toString('utf8'));

  assert.match(result.filename, /^kote-export-\d{4}-\d{2}-\d{2}\.zip$/);
  assert.deepEqual(manifest.counts, { workspaces: 2, projects: 2, folders: 1, categories: 2, repositories: 1, notes: 1, noteLinks: 1, attachments: 1 });
  assert.equal(projects[0].enabled, false);
  assert.deepEqual(notes[0].categoryIds, ['cat-1']);
  assert.equal(entries.get('notes/alpha/one/note-1.md').toString('utf8'), '# note-1\n\nOriginal body');
  assert.equal(entries.get('attachments/note-1/original.txt').toString('utf8'), 'attachment');
  assert.equal(manifest.files.attachments[0].sha256, '602a5e69c3021bdbd3d25156a02d2cbb467605b8203248eea6af3fb42168d663');
});

test('global export works beyond the project export note limit', async () => {
  const notes = Array.from({ length: 5001 }, (_, index) => note(`note-${index + 1}`, 'alpha', 'one'));
  const useCase = createUseCase({ notes });
  const result = await useCase.execute('user-1');
  const manifest = JSON.parse(readZipEntries(result.buffer).get('manifest.json').toString('utf8'));
  assert.equal(manifest.counts.notes, 5001);
});

test('global export fails explicitly when required Markdown is unavailable', async () => {
  const useCase = createUseCase({
    notes: [{ ...note('note-1', 'alpha', 'one'), markdown: '', markdownStorageKey: 'missing-key' }],
  });
  await assert.rejects(() => useCase.execute('user-1'), /global_export_markdown_unavailable/);
});
