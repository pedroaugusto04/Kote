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
  const useCase = new FindRelatedNotesByFileUseCase(null, null, null, mockRuntimeEnv, logger, null);
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
      vectorSearchOptions.push(options);
      return [
        { noteId: 'note-B', similarity: 0.95 },
        { noteId: 'note-C', similarity: 0.85 },
        { noteId: 'note-D', similarity: 0.75 },
      ];
    },
  };

  const mockEmbeddingQueue = {
    publishQueryEmbedding: async () => {
      return [[0.1, 0.2, 0.3]];
    },
  };

  const vectorSearchOptions = [];
  const ftsFilters = [];
  mockContentQueryRepository.list = async (userId, filters) => {
    ftsFilters.push(filters);
    return [
      { id: 'note-A', title: 'Note A', ftsRank: 0.9, occurredAt: new Date().toISOString(), status: 'active', tags: [], categories: [], summary: '' },
      { id: 'note-B', title: 'Note B', ftsRank: 0.8, occurredAt: new Date().toISOString(), status: 'active', tags: [], categories: [], summary: '' },
      { id: 'note-C', title: 'Note C', ftsRank: 0.7, occurredAt: new Date().toISOString(), status: 'active', tags: [], categories: [], summary: '' },
      { id: 'note-D', title: 'Note D', ftsRank: 0.6, occurredAt: new Date().toISOString(), status: 'active', tags: [], categories: [], summary: '' },
    ];
  };

  const mockRuntimeEnv = {
    read: () => ({
      embeddingAiProvider: 'ollama',
      embeddingAiBaseUrl: 'http://ollama',
      embeddingAiModel: 'nomic',
      embeddingAiApiKey: 'key',
      codeLensSearchMinSimilarity: 0.30,
      codeLensSearchCandidateLimit: 20,
      codeLensSearchVectorWeight: 0.4,
      codeLensSearchKeywordWeight: 0.6,
      codeLensSearchRrfK: 20,
      codeLensSearchResultLimit: 3,
      codeLensSnippetSearchMinSimilarity: 0.44,
      codeLensSnippetSearchCandidateLimit: 11,
      codeLensSnippetSearchVectorWeight: 0.7,
      codeLensSnippetSearchKeywordWeight: 0.3,
      codeLensSnippetSearchRrfK: 17,
      codeLensSnippetSearchResultLimit: 2,
    }),
  };

  const useCase = new FindRelatedNotesByFileUseCase(
    mockContentRepository,
    mockContentQueryRepository,
    mockNoteEmbeddingRepository,
    mockRuntimeEnv,
    logger,
    mockEmbeddingQueue,
  );

  // Exclude note-B (simulates note already found in direct notes query)
  const result = await useCase.execute('user-1', 'auth.service.ts', ['note-B']);

  // Assertions: Limit is 3, note-B is excluded, so C, D and A remain.
  // C and D rank above A because they have both vector and keyword evidence.
  assert.equal(result.length, 3);
  assert.equal(result[0].id, 'note-C');
  assert.equal(result[1].id, 'note-D');
  assert.equal(result[2].id, 'note-A');
  assert.equal(result[0].semanticSimilarity, 0.85);
  assert.equal(result[1].semanticSimilarity, 0.75);
  assert.equal(result[2].semanticSimilarity, undefined);

  const snippetResult = await useCase.execute(
    'user-1',
    'auth.service.ts',
    [],
    'selectedSnippetIdentifier()',
    undefined,
    1,
    'snippet',
  );

  assert.equal(snippetResult.length, 1);
  assert.equal(snippetResult[0].lineageCategory, 'cross-file-related');
  assert.deepEqual(vectorSearchOptions.at(-1), { limit: 44, minSimilarity: 0.44, projectId: undefined });
  assert.equal(ftsFilters.at(-1).query, 'selectedsnippetidentifier');
  assert.equal(ftsFilters.at(-1).ftsLimit, 11);
});

test('FindRelatedNotesByFileUseCase keeps vector-only notes in the result set', async () => {
  const now = new Date().toISOString();
  const noteRecord = {
    id: 'semantic-only',
    title: 'Retry orchestration decision',
    workspaceSlug: 'default',
    projectSlug: 'kote',
    path: 'notes/retry.md',
    occurredAt: now,
    status: 'active',
    tags: [],
    categories: [],
    sourceChannel: 'ai-chat',
    source: 'codex',
    summary: 'Explains why invoice retries use an idempotency guard.',
    markdownStorageKey: '',
    metadata: {},
    isPinned: false,
    createdAt: now,
    updatedAt: now,
  };
  const vectorOptions = [];
  const useCase = new FindRelatedNotesByFileUseCase(
    {
      getNotesByIds: async (_userId, ids) => ids.includes(noteRecord.id) ? [noteRecord] : [],
    },
    { list: async () => [] },
    {
      findSimilar: async (_userId, _embedding, options) => {
        vectorOptions.push(options);
        return [
          { noteId: noteRecord.id, similarity: 0.82, chunkIndex: 0 },
          { noteId: noteRecord.id, similarity: 0.79, chunkIndex: 1 },
        ];
      },
    },
    {
      read: () => ({
        embeddingAiProvider: 'openai',
        embeddingAiModel: 'text-embedding-3-small',
        embeddingAiApiKey: 'secret',
        codeLensSnippetSearchMinSimilarity: 0.3,
        codeLensSnippetSearchCandidateLimit: 10,
        codeLensSnippetSearchVectorWeight: 0.7,
        codeLensSnippetSearchKeywordWeight: 0.3,
        codeLensSnippetSearchRrfK: 20,
        codeLensSnippetSearchResultLimit: 10,
      }),
    },
    { info: () => {}, warn: () => {} },
    { publishQueryEmbedding: async () => [[0.1, 0.2]] },
  );

  const result = await useCase.execute(
    'user-1',
    'src/billing/retry.ts',
    [],
    'reconcileInvoiceWithIdempotencyGuard()',
    undefined,
    10,
    'snippet',
  );

  assert.equal(result.length, 1);
  assert.equal(result[0].id, 'semantic-only');
  assert.equal(result[0].semanticSimilarity, 0.82);
  assert.equal(result[0].lineageCategory, 'cross-file-related');
  assert.deepEqual(vectorOptions[0], { limit: 40, minSimilarity: 0.3, projectId: undefined });
});

test('snippet profile removes candidates below the backend lineage threshold', async () => {
  const now = new Date().toISOString();
  const useCase = new FindRelatedNotesByFileUseCase(
    {
      getNotesByIds: async (_userId, ids) => ids.map((id) => ({
        id,
        title: id,
        path: `${id}.md`,
        categories: [],
        tags: [],
        status: 'active',
        summary: id,
        source: 'codex',
        sourceChannel: 'ai-chat',
        metadata: {},
        occurredAt: now,
        createdAt: now,
        updatedAt: now,
      })),
    },
    { list: async () => [] },
    { findSimilar: async () => [{ noteId: 'below-threshold', similarity: 0.47 }] },
    {
      read: () => ({
        embeddingAiProvider: 'openai',
        embeddingAiModel: 'embedding-model',
        embeddingAiApiKey: 'secret',
        codeLensSnippetSearchMinSimilarity: 0.3,
        codeLensSnippetSearchCandidateLimit: 10,
        codeLensSnippetSearchVectorWeight: 0.7,
        codeLensSnippetSearchKeywordWeight: 0.3,
        codeLensSnippetSearchRrfK: 20,
        codeLensSnippetSearchResultLimit: 10,
      }),
    },
    { info: () => {}, warn: () => {} },
    { publishQueryEmbedding: async () => [[0.1, 0.2]] },
  );

  const result = await useCase.execute(
    'user-1',
    'src/billing/retry.ts',
    [],
    'retryInvoice()',
    undefined,
    10,
    'snippet',
  );

  assert.deepEqual(result, []);
});
