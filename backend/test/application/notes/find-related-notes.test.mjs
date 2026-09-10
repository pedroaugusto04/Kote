import test from 'node:test';
import assert from 'node:assert/strict';

import { FindRelatedNotesUseCase } from '../../../dist/application/use-cases/notes/find-related-notes.use-case.js';

test('FindRelatedNotesUseCase preserves descending similarity order from note embeddings', async () => {
  const mockContentRepository = {
    getNoteById: async (userId, noteId) => {
      if (noteId === 'source-note') {
        return {
          id: 'source-note',
          title: 'Source Note',
          workspaceSlug: 'ws',
          projectSlug: 'ps',
          path: 'source.md',
          markdown: 'source content',
          markdownStorageKey: '',
          frontmatter: {},
          metadata: {},
          origin: '',
          source: '',
          links: [],
        };
      }
      return null;
    },
    getNotesByIds: async (userId, ids) => {
      // Return notes in an arbitrary order to verify that the use case sorts them back correctly
      const notes = [
        { id: 'note-C', title: 'Note C', workspaceSlug: 'ws', projectSlug: 'ps', path: 'note-c.md', markdown: '', markdownStorageKey: '', frontmatter: {}, metadata: {}, origin: '', source: '', links: [] },
        { id: 'note-A', title: 'Note A', workspaceSlug: 'ws', projectSlug: 'ps', path: 'note-a.md', markdown: '', markdownStorageKey: '', frontmatter: {}, metadata: {}, origin: '', source: '', links: [] },
        { id: 'note-B', title: 'Note B', workspaceSlug: 'ws', projectSlug: 'ps', path: 'note-b.md', markdown: '', markdownStorageKey: '', frontmatter: {}, metadata: {}, origin: '', source: '', links: [] },
      ];
      return notes.filter((n) => ids.includes(n.id));
    },
  };

  const mockNoteEmbeddingRepository = {
    getNoteEmbeddings: async (userId, noteId) => {
      return [{ embedding: [0.1, 0.2, 0.3] }];
    },
    getNotesEmbeddings: async (userId, noteIds) => {
      return noteIds.map((id) => ({ embedding: [0.1, 0.2, 0.3] }));
    },
    findSimilar: async (userId, embedding, options) => {
      // Chunks are returned in similarity descending order (0.9, 0.8, 0.7)
      return [
        { noteId: 'note-A', similarity: 0.9 },
        { noteId: 'note-B', similarity: 0.8 },
        { noteId: 'note-C', similarity: 0.7 },
      ];
    },
  };

  const useCase = new FindRelatedNotesUseCase(mockContentRepository, mockNoteEmbeddingRepository);

  const result = await useCase.execute('user-123', 'source-note', 3);

  // Assertions
  assert.equal(result.length, 3);
  // Order must match the similarity ordering: A, then B, then C
  assert.equal(result[0].id, 'note-A');
  assert.equal(result[1].id, 'note-B');
  assert.equal(result[2].id, 'note-C');
});

test('FindRelatedNotesUseCase uses raw embedding chunk 0 even when synthesis embedding is listed first', async () => {
  let passedQueryEmbedding = null;
  let passedOptions = null;

  const mockContentRepository = {
    getNoteById: async (userId, noteId) => ({
      id: noteId,
      title: 'Source Note',
      workspaceSlug: 'ws',
      projectSlug: 'ps',
      path: 'source.md',
      markdown: 'source content',
      markdownStorageKey: '',
      frontmatter: {},
      metadata: {},
      origin: '',
      source: '',
      links: [],
    }),
    getNotesByIds: async (userId, ids) => [
      { id: 'note-A', title: 'Note A', workspaceSlug: 'ws', projectSlug: 'ps', path: 'note-a.md', markdown: '', markdownStorageKey: '', frontmatter: {}, metadata: {}, origin: '', source: '', links: [] },
    ],
  };

  const mockNoteEmbeddingRepository = {
    getNoteEmbeddings: async (userId, noteId) => [
      { chunkIndex: 0, representation: 'synthesis', embedding: [0.99, 0.99, 0.99] },
      { chunkIndex: 0, representation: 'raw', embedding: [0.1, 0.2, 0.3] },
    ],
    findSimilar: async (userId, embedding, options) => {
      passedQueryEmbedding = embedding;
      passedOptions = options;
      return [{ noteId: 'note-A', similarity: 0.9 }];
    },
  };

  const useCase = new FindRelatedNotesUseCase(mockContentRepository, mockNoteEmbeddingRepository);
  const result = await useCase.execute('user-123', 'source-note', 3);

  assert.equal(result.length, 1);
  assert.deepEqual(passedQueryEmbedding, [0.1, 0.2, 0.3]);
  assert.equal(passedOptions.representation, 'raw');
});

