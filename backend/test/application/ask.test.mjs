import test from 'node:test';
import assert from 'node:assert/strict';

import { AskKnowledgeUseCase } from '../../dist/application/use-cases/query/ask-knowledge.use-case.js';

test('AskKnowledgeUseCase embeds query, fetches similar chunks, and generates answer', async () => {
  // Mocks
  const mockEmbeddingGateway = {
    generateEmbeddings: async (config, texts) => {
      assert.deepEqual(texts, ['How to deploy?']);
      return [[0.1, 0.2, 0.3]];
    },
  };

  const mockNoteEmbeddingRepository = {
    findSimilar: async (userId, embedding, options) => {
      assert.equal(userId, 'user-123');
      assert.deepEqual(embedding, [0.1, 0.2, 0.3]);
      assert.equal(options.limit, 8);
      return [
        {
          id: 'emb-1',
          userId: 'user-123',
          noteId: 'note-1',
          chunkIndex: 0,
          chunkText: 'Deploy to staging first.',
          embedding: [0.1, 0.2, 0.3],
          model: 'gemini-embedding-001',
          createdAt: '',
          updatedAt: '',
          similarity: 0.9,
        },
      ];
    },
    upsertChunks: async () => {},
    deleteByNoteId: async () => {},
  };

  const mockContentRepository = {
    getNoteById: async (userId, noteId) => {
      assert.equal(userId, 'user-123');
      assert.equal(noteId, 'note-1');
      return {
        id: 'note-1',
        path: 'docs/deploy.md',
        type: 'note',
        title: 'Deployment Guide',
        projectSlug: 'infra',
        workspaceSlug: 'default',
        folderId: null,
        status: 'active',
        tags: [],
        occurredAt: '',
        sourceChannel: '',
        summary: '',
        markdown: 'Deploy to staging first.',
        markdownStorageKey: '',
        frontmatter: {},
        metadata: {},
        origin: '',
        source: '',
        links: [],
      };
    },
  };

  const mockAnswerGenerationGateway = {
    generate: async (config, payload) => {
      assert.equal(payload.question, 'How to deploy?');
      assert.deepEqual(payload.context, [
        {
          noteId: 'note-1',
          title: 'Deployment Guide',
          path: 'docs/deploy.md',
          projectSlug: 'infra',
          workspaceSlug: 'default',
          chunkText: 'Deploy to staging first.',
        },
      ]);
      return {
        answer: 'You should deploy to staging first.',
        confidence: 'high',
        sources: [
          { noteId: 'note-1', title: 'Deployment Guide', path: 'docs/deploy.md' },
        ],
      };
    },
  };

  const mockRuntimeEnv = {
    read: () => ({
      embeddingAiProvider: 'gemini',
      embeddingAiBaseUrl: 'http://gemini.api',
      embeddingAiModel: 'gemini-embedding-001',
      embeddingAiApiKey: 'key-123',
      conversationAiProvider: 'openai',
      conversationAiBaseUrl: 'http://openai.api',
      conversationAiModel: 'gpt-4',
      conversationAiApiKey: 'key-456',
    }),
  };

  const useCase = new AskKnowledgeUseCase(
    mockEmbeddingGateway,
    mockNoteEmbeddingRepository,
    mockContentRepository,
    mockAnswerGenerationGateway,
    mockRuntimeEnv,
  );

  const result = await useCase.execute('How to deploy?', 'user-123');

  assert.equal(result.ok, true);
  assert.equal(result.answer, 'You should deploy to staging first.');
  assert.equal(result.confidence, 'high');
  assert.deepEqual(result.sources, [
    { noteId: 'note-1', title: 'Deployment Guide', path: 'docs/deploy.md' },
  ]);
  assert.deepEqual(result.relatedNotes, [
    {
      id: 'note-1',
      title: 'Deployment Guide',
      path: 'docs/deploy.md',
      projectSlug: 'infra',
      workspaceSlug: 'default',
    },
  ]);
});
