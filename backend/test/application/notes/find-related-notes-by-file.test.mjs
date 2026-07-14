import test from 'node:test';
import assert from 'node:assert/strict';

import {
  FindRelatedNotesByFileUseCase
} from '../../../dist/application/use-cases/notes/find-related-notes-by-file.use-case.js';
import {
  filePathToQuery,
  isGenericFile
} from '../../../dist/application/utils/query/file-query.utils.js';

test('filePathToQuery normalizes files correctly', () => {
  assert.equal(filePathToQuery('src/auth/auth.service.ts'), 'auth service');
  assert.equal(filePathToQuery('PaymentController.ts'), 'payment controller');
  assert.equal(filePathToQuery('some-helper-utils.js'), 'some helper utils');
  assert.equal(filePathToQuery('index.ts'), 'index');
});

test('isGenericFile detects generic file names', () => {
  assert.equal(isGenericFile('src/index.ts'), true);
  assert.equal(isGenericFile('utils.js'), true);
  assert.equal(isGenericFile('ui.tsx'), true); // length <= 2
  assert.equal(isGenericFile('payment.service.ts'), false);
});

test('FindRelatedNotesByFileUseCase skips generic files', async () => {
  const logger = { info: () => {}, warn: () => {} };
  const mockRuntimeEnv = { read: () => ({}) };
  const useCase = new FindRelatedNotesByFileUseCase(null, null, null, null, mockRuntimeEnv, logger);
  const result = await useCase.execute('user-1', 'src/index.ts');
  assert.deepEqual(result, []);
});

test('FindRelatedNotesByFileUseCase returns related notes sorted by score with RRF and excludes noted SQL ids', async () => {
  const logger = { info: () => {}, warn: () => {} };
  
  const mockContentRepository = {
    getNotesByIds: async (userId, ids) => {
      return ids.map((id) => ({
        id,
        title: `Title for ${id}`,
        workspaceSlug: 'ws',
        projectSlug: 'ps',
        path: `${id}.md`,
        occurredAt: new Date().toISOString(),
        status: 'active',
        tags: [],
        categories: [],
        sourceChannel: '',
        source: '',
        summary: `Summary for ${id}`,
        markdownStorageKey: '',
        metadata: {},
        isPinned: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }));
    }
  };

  const mockContentQueryRepository = {
    list: async (userId, filters) => {
      // FTS search list
      return [
        { id: 'note-A', title: 'Note A', ftsRank: 0.9, occurredAt: new Date().toISOString(), status: 'active', tags: [], categories: [], summary: '' },
        { id: 'note-B', title: 'Note B', ftsRank: 0.8, occurredAt: new Date().toISOString(), status: 'active', tags: [], categories: [], summary: '' },
        { id: 'note-C', title: 'Note C', ftsRank: 0.7, occurredAt: new Date().toISOString(), status: 'active', tags: [], categories: [], summary: '' },
        { id: 'note-D', title: 'Note D', ftsRank: 0.6, occurredAt: new Date().toISOString(), status: 'active', tags: [], categories: [], summary: '' },
      ];
    },
  };

  const mockNoteEmbeddingRepository = {
    findSimilar: async (userId, embedding, options) => {
      return [
        { noteId: 'note-B', similarity: 0.95 },
        { noteId: 'note-C', similarity: 0.85 },
        { noteId: 'note-D', similarity: 0.75 },
      ];
    },
  };

  const mockEmbeddingGateway = {
    generateEmbeddings: async () => {
      return [[0.1, 0.2, 0.3]];
    },
  };

  const mockRuntimeEnv = {
    read: () => ({
      codeLensSearchAiProvider: 'ollama',
      codeLensSearchAiBaseUrl: 'http://ollama',
      codeLensSearchAiModel: 'nomic',
      codeLensSearchAiApiKey: 'key',
      codeLensSearchMinSimilarity: 0.30,
      codeLensSearchCandidateLimit: 20,
      codeLensSearchVectorWeight: 0.4,
      codeLensSearchKeywordWeight: 0.6,
      codeLensSearchRrfK: 20,
      codeLensSearchResultLimit: 3,
    }),
  };

  const useCase = new FindRelatedNotesByFileUseCase(
    mockContentRepository,
    mockContentQueryRepository,
    mockEmbeddingGateway,
    mockNoteEmbeddingRepository,
    mockRuntimeEnv,
    logger,
  );

  // Exclude note-B (simulates note already found in direct notes query)
  const result = await useCase.execute('user-1', 'auth.service.ts', ['note-B']);

  // Assertions: Limit is 3, note-B is excluded, so it should return C, D, A
  assert.equal(result.length, 3);
  assert.equal(result[0].id, 'note-C');
  assert.equal(result[1].id, 'note-D');
  assert.equal(result[2].id, 'note-A');
});
