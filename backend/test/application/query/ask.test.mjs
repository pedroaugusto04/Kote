import test from 'node:test';
import assert from 'node:assert/strict';

import { AskKnowledgeUseCase } from '../../../dist/application/use-cases/query/ask-knowledge.use-case.js';
import { RunAskAiUseCase } from '../../../dist/application/use-cases/query/run-ask-ai.use-case.js';
import { ListAskHistoryUseCase } from '../../../dist/application/use-cases/query/list-ask-history.use-case.js';

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
      assert.equal(options.limit, 16);
      assert.equal(options.projectSlug, 'infra');
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
    getNotesByIds: async (userId, noteIds) => {
      assert.equal(userId, 'user-123');
      assert.deepEqual(noteIds, ['note-1']);
      return [
        {
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
        },
      ];
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
          workspaceId: undefined,
          chunkText: 'Deploy to staging first.',
        },
      ]);
      return {
        answer: 'You should deploy to staging first.',
        confidence: 'high',
        requestedAttachments: false,
        sources: [
          { noteId: 'note-1', title: 'Deployment Guide', path: 'docs/deploy.md' },
        ],
      };
    },
    rewriteQuery: async (config, question, history) => {
      return question;
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

  const mockQuotaService = {
    async checkAndIncrementAiUsage() { return { allowed: true, limit: -1, current: 0 }; },
  };

  const useCase = new AskKnowledgeUseCase(
    mockEmbeddingGateway,
    mockNoteEmbeddingRepository,
    mockContentRepository,
    mockAnswerGenerationGateway,
    mockRuntimeEnv,
    mockQuotaService,
  );

  const result = await useCase.execute('How to deploy?', 'user-123', { projectSlug: 'infra' });

  assert.equal(result.ok, true);
  assert.equal(result.answer, 'You should deploy to staging first.');
  assert.equal(result.confidence, 'high');
  assert.equal(result.requestedAttachments, false);
  assert.deepEqual(result.sources, [
    { noteId: 'note-1', title: 'Deployment Guide', path: 'docs/deploy.md' },
  ]);
  assert.deepEqual(result.relatedNotes, [
    {
      id: 'note-1',
      title: 'Deployment Guide',
      path: 'docs/deploy.md',
      projectSlug: 'infra',
      workspaceId: undefined,
    },
  ]);
});

test('RunAskAiUseCase saves only successful web Ask AI answers and dispatches requested attachments via Whatsapp', async () => {
  const saved = [];
  const askKnowledge = {
    calls: [],
    result: {
      ok: true,
      answer: 'Deploy to staging first.',
      confidence: 'high',
      requestedAttachments: true,
      sources: [{ noteId: 'note-1', title: 'Deploy', path: 'docs/deploy.md' }],
      relatedNotes: [{ id: 'note-1', title: 'Deploy', path: 'docs/deploy.md', projectSlug: 'platform', workspaceSlug: 'default' }],
    },
    async execute(question, userId, options) {
      this.calls.push({ question, userId, options });
      return this.result;
    },
  };
  const repository = {
    async save(input) {
      saved.push(input);
    },
  };
  const contentRepository = {
    async listWorkspaces(userId) {
      return [{ workspaceSlug: 'default', whatsappChatJid: '12345@c.us' }];
    },
  };
  const resolveWhatsappAskAttachmentsUseCase = {
    calls: [],
    async execute(input) {
      this.calls.push(input);
      return {
        requested: true,
        media: [{
          noteId: 'note-1',
          attachmentId: 'att-123',
          mediaType: 'document',
          mimeType: 'application/pdf',
          fileName: 'manual.pdf',
          mediaBase64: 'dGVzdA==',
        }],
      };
    },
  };
  const sentMedia = [];
  const whatsappReplySender = {
    async sendMedia(input) {
      sentMedia.push(input);
      return { ok: true };
    },
  };

  const useCase = new RunAskAiUseCase(
    askKnowledge,
    repository,
    contentRepository,
    resolveWhatsappAskAttachmentsUseCase,
    whatsappReplySender,
  );
  const result = await useCase.execute('How to deploy?', 'user-123', { projectSlug: 'platform' });

  assert.deepEqual(result, {
    ...askKnowledge.result,
    media: [{
      noteId: 'note-1',
      attachmentId: 'att-123',
      mediaType: 'document',
      mimeType: 'application/pdf',
      fileName: 'manual.pdf',
      mediaBase64: 'dGVzdA==',
    }],
  });
  assert.deepEqual(askKnowledge.calls, [{ question: 'How to deploy?', userId: 'user-123', options: { projectSlug: 'platform', workspaceSlug: undefined } }]);
  assert.deepEqual(saved, [{
    userId: 'user-123',
    projectSlug: 'platform',
    question: 'How to deploy?',
    answer: 'Deploy to staging first.',
    confidence: 'high',
    sources: [{ noteId: 'note-1', title: 'Deploy', path: 'docs/deploy.md' }],
    relatedNotes: [{ id: 'note-1', title: 'Deploy', path: 'docs/deploy.md', projectSlug: 'platform', workspaceSlug: 'default' }],
  }]);

  assert.equal(resolveWhatsappAskAttachmentsUseCase.calls.length, 1);
  assert.deepEqual(sentMedia, [{
    chatJid: '12345@c.us',
    mediaType: 'document',
    mimeType: 'application/pdf',
    fileName: 'manual.pdf',
    mediaBase64: 'dGVzdA==',
  }]);

  askKnowledge.result = { ok: false, answer: 'Failed.', confidence: 'low', requestedAttachments: false, sources: [], relatedNotes: [] };
  await useCase.execute('Broken?', 'user-123');
  assert.equal(saved.length, 1);
});

test('ListAskHistoryUseCase delegates pagination and project filtering to repository', async () => {
  const calls = [];
  const repository = {
    async list(input) {
      calls.push(input);
      return { items: [], pagination: { page: input.page, pageSize: input.pageSize, total: 0, totalPages: 1, hasNext: false, hasPrevious: false } };
    },
  };

  const useCase = new ListAskHistoryUseCase(repository);
  const result = await useCase.execute('user-123', { page: 2, pageSize: 5, projectSlug: 'platform' });

  assert.deepEqual(calls, [{ userId: 'user-123', page: 2, pageSize: 5, projectSlug: 'platform' }]);
  assert.equal(result.pagination.page, 2);
});

test('AskKnowledgeUseCase rewrites the question using the gateway when history is present', async () => {
  const mockEmbeddingGateway = {
    generateEmbeddings: async (config, texts) => {
      assert.deepEqual(texts, ['How to deploy the platform application?']);
      return [[0.1, 0.2, 0.3]];
    },
  };

  const mockNoteEmbeddingRepository = {
    findSimilar: async () => [],
  };

  const mockContentRepository = {
    getNotesByIds: async () => [],
  };

  const mockAnswerGenerationGateway = {
    generate: async () => null,
    rewriteQuery: async (config, question, history) => {
      assert.equal(question, 'And how do I deploy it?');
      assert.equal(history.length, 1);
      assert.equal(history[0].question, 'What is the platform application?');
      return 'How to deploy the platform application?';
    },
  };

  const mockRuntimeEnv = {
    read: () => ({
      embeddingAiProvider: 'gemini',
      embeddingAiBaseUrl: 'http://gemini.api',
      embeddingAiModel: 'gemini-embedding-001',
      embeddingAiApiKey: 'key-123',
    }),
  };

  const mockQuotaService = {
    async checkAndIncrementAiUsage() { return { allowed: true, limit: -1, current: 0 }; },
  };

  const useCase = new AskKnowledgeUseCase(
    mockEmbeddingGateway,
    mockNoteEmbeddingRepository,
    mockContentRepository,
    mockAnswerGenerationGateway,
    mockRuntimeEnv,
    mockQuotaService,
  );

  const history = [
    { question: 'What is the platform application?', answer: 'It is a dashboard.', projectSlug: 'infra', timestamp: '' },
  ];

  await useCase.execute('And how do I deploy it?', 'user-123', { conversationHistory: history });
});

test('AskKnowledgeUseCase ignores history for standalone questions', async () => {
  const mockEmbeddingGateway = {
    generateEmbeddings: async (config, texts) => {
      assert.deepEqual(texts, ['envie minha monografia']);
      return [[0.1, 0.2, 0.3]];
    },
  };

  const mockNoteEmbeddingRepository = {
    findSimilar: async () => [{
      id: 'emb-1',
      userId: 'user-123',
      noteId: 'note-1',
      chunkIndex: 0,
      chunkText: 'Monografia final em PDF.',
      embedding: [0.1, 0.2, 0.3],
      model: 'gemini-embedding-001',
      createdAt: '',
      updatedAt: '',
      similarity: 0.9,
    }],
  };

  const mockContentRepository = {
    getNotesByIds: async () => [{
      id: 'note-1',
      path: 'docs/monografia.md',
      type: 'note',
      title: 'Monografia',
      projectSlug: 'academic',
      workspaceSlug: 'default',
      folderId: null,
      status: 'active',
      tags: [],
      occurredAt: '',
      sourceChannel: '',
      summary: '',
      markdown: 'Monografia final em PDF.',
      markdownStorageKey: '',
      frontmatter: {},
      metadata: {},
      origin: '',
      source: '',
      links: [],
    }],
  };

  let rewriteCalled = false;
  const mockAnswerGenerationGateway = {
    generate: async (config, payload) => {
      assert.equal(payload.question, 'envie minha monografia');
      assert.equal(payload.conversationHistory, undefined);
      return {
        answer: 'Sending your monograph.',
        confidence: 'high',
        requestedAttachments: true,
        requestedAttachmentPattern: 'monografia',
        sources: [{ noteId: 'note-1', title: 'Monografia', path: 'docs/monografia.md' }],
      };
    },
    rewriteQuery: async () => {
      rewriteCalled = true;
      return 'corrupted query from history';
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

  const mockQuotaService = {
    async checkAndIncrementAiUsage() { return { allowed: true, limit: -1, current: 0 }; },
  };

  const useCase = new AskKnowledgeUseCase(
    mockEmbeddingGateway,
    mockNoteEmbeddingRepository,
    mockContentRepository,
    mockAnswerGenerationGateway,
    mockRuntimeEnv,
    mockQuotaService,
  );

  const history = [
    { question: 'me envie o contrato', answer: 'Sending the contract.', projectSlug: 'legal', timestamp: '' },
  ];

  const result = await useCase.execute('envie minha monografia', 'user-123', { conversationHistory: history });

  assert.equal(rewriteCalled, false);
  assert.equal(result.requestedAttachmentPattern, 'monografia');
});

test('AskKnowledgeUseCase handles special query intent and retrieves matching notes directly, bypassing embedding generation and vector search', async () => {
  const mockEmbeddingGateway = {
    generateEmbeddings: async () => {
      assert.fail('Should not generate embeddings for special query intent');
    },
  };

  const mockNoteEmbeddingRepository = {
    findSimilar: async () => {
      assert.fail('Should not query similar chunks for special query intent');
    },
  };

  const mockContentRepository = {
    listNotes: async (userId) => {
      assert.equal(userId, 'user-123');
      return [
        {
          id: 'note-old',
          path: 'docs/old.md',
          categories: [{ id: 'cat-1', name: 'event' }],
          title: 'Older Note',
          projectSlug: 'infra',
          workspaceSlug: 'default',
          folderId: null,
          status: 'active',
          tags: [],
          occurredAt: '2026-04-20T10:00:00.000Z',
          sourceChannel: '',
          summary: 'Older summary',
          markdown: 'Older markdown content',
          metadata: {},
        },
        {
          id: 'note-new',
          path: 'docs/new.md',
          categories: [{ id: 'cat-1', name: 'event' }],
          title: 'Newer Note',
          projectSlug: 'infra',
          workspaceSlug: 'default',
          folderId: null,
          status: 'active',
          tags: [],
          occurredAt: '2026-04-25T10:00:00.000Z',
          sourceChannel: '',
          summary: 'Newer summary',
          markdown: 'Newer markdown content',
          metadata: {},
        },
      ];
    },
  };

  const mockAnswerGenerationGateway = {
    generate: async (config, payload) => {
      assert.equal(payload.question, 'Summarize my recent notes');
      // Should receive the matching notes as context chunks, sorted newest first
      assert.deepEqual(payload.context, [
        {
          noteId: 'note-new',
          title: 'Newer Note',
          path: 'docs/new.md',
          projectSlug: 'infra',
          workspaceId: undefined,
          chunkText: 'Newer markdown content',
        },
        {
          noteId: 'note-old',
          title: 'Older Note',
          path: 'docs/old.md',
          projectSlug: 'infra',
          workspaceId: undefined,
          chunkText: 'Older markdown content',
        },
      ]);
      return {
        answer: 'Here is a summary of your recent notes.',
        confidence: 'high',
        requestedAttachments: false,
        sources: [
          { noteId: 'note-new', title: 'Newer Note', path: 'docs/new.md' },
          { noteId: 'note-old', title: 'Older Note', path: 'docs/old.md' },
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

  const mockQuotaService = {
    async checkAndIncrementAiUsage() { return { allowed: true, limit: -1, current: 0 }; },
  };

  const useCase = new AskKnowledgeUseCase(
    mockEmbeddingGateway,
    mockNoteEmbeddingRepository,
    mockContentRepository,
    mockAnswerGenerationGateway,
    mockRuntimeEnv,
    mockQuotaService,
  );

  const result = await useCase.execute('Summarize my recent notes', 'user-123', { projectSlug: 'infra', workspaceSlug: 'default' });

  assert.equal(result.ok, true);
  assert.equal(result.answer, 'Here is a summary of your recent notes.');
  assert.deepEqual(result.relatedNotes, [
    { id: 'note-new', title: 'Newer Note', path: 'docs/new.md', projectSlug: 'infra', workspaceId: undefined },
    { id: 'note-old', title: 'Older Note', path: 'docs/old.md', projectSlug: 'infra', workspaceId: undefined },
  ]);
});

