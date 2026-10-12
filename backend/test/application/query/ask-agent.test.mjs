import test from 'node:test';
import assert from 'node:assert/strict';

import { AgentAskKnowledgeUseCase } from '../../../dist/application/use-cases/query/agent-ask-knowledge.use-case.js';
import { AskAgentToolsService, AgentContextTracker } from '../../../dist/application/services/query/ask-agent-tools.service.js';
import { RagRetrievalService } from '../../../dist/application/services/query/rag-retrieval.service.js';
import { RagContextAssemblerService } from '../../../dist/application/services/query/rag-context-assembler.service.js';
import { ConversationConfidence } from '../../../dist/contracts/enums.js';

const dummyLogger = {
  info() {},
  warn() {},
  error() {},
  debug() {},
};

const dummyAiEntitlement = {
  async requireAndConsume() {
    return { allowed: true, limit: -1, current: 0 };
  },
  async isEnabled() {
    return true;
  },
};

const dummyRuntimeEnv = {
  read() {
    return {
      conversationAiProvider: 'gemini',
      conversationAiBaseUrl: 'https://generativelanguage.googleapis.com/v1beta',
      conversationAiModel: 'gemini-2.5-flash',
      conversationAiApiKey: 'dummy-key',
      embeddingAiProvider: 'gemini',
      embeddingAiBaseUrl: '',
      embeddingAiModel: 'gemini-embedding-001',
      embeddingAiApiKey: 'dummy-emb-key',
    };
  },
};

test('AgentContextTracker accumulates sources and related notes without duplicates', () => {
  const tracker = new AgentContextTracker();
  tracker.addSource({
    noteId: 'note-1',
    title: 'Architecture Guide',
    path: 'docs/arch.md',
    projectSlug: 'core',
  });
  tracker.addSource({
    noteId: 'note-1',
    title: 'Architecture Guide',
    path: 'docs/arch.md',
    projectSlug: 'core',
  });
  tracker.addRelatedNote({
    id: 'note-2',
    title: 'DB Guide',
    path: 'docs/db.md',
    projectSlug: 'core',
  });

  assert.equal(tracker.getSources().length, 1);
  assert.equal(tracker.getSources()[0].noteId, 'note-1');
  assert.equal(tracker.getRelatedNotes().length, 2);
});

test('AskAgentToolsService creates all 6 agent tools and executes them', async () => {
  const mockContentRepository = {
    listWorkspaces: async () => [{ id: 'ws-1', workspaceSlug: 'default' }],
    getNotesByIds: async (userId, ids) => {
      if (ids.includes('note-10')) {
        return [
          {
            id: 'note-10',
            title: 'Deployment Specs',
            path: 'infra/deploy.md',
            projectSlug: 'infra',
            workspaceSlug: 'default',
            tags: ['devops'],
            markdown: 'Step 1: build image. Step 2: deploy k8s.',
          },
        ];
      }
      return [];
    },
    listProjects: async () => [
      {
        id: 'proj-1',
        displayName: 'Infrastructure',
        projectSlug: 'infra',
        workspaceId: 'ws-1',
        repositories: [],
        defaultTags: ['cloud'],
        enabled: true,
        favorite: false,
      },
    ],
    listNotes: async () => [
      {
        id: 'note-1',
        title: 'Recent Note 1',
        path: 'n1.md',
        projectSlug: 'infra',
        workspaceSlug: 'default',
        occurredAt: '2026-10-10T00:00:00Z',
      },
    ],
    listAttachments: async () => [
      {
        id: 'att-1',
        fileName: 'architecture.pdf',
        sizeBytes: 1024,
        mimeType: 'application/pdf',
        createdAt: '2026-10-10T00:00:00Z',
      },
    ],
  };

  const mockContentQueryRepository = {
    listReminders: async () => [
      {
        id: 'rem-1',
        title: 'Deploy to Prod',
        noteText: 'Prepare release',
        project: 'infra',
        workspace: 'default',
        status: 'pending',
        isOverdue: false,
        reminderAt: '2026-10-12T10:00:00Z',
        relativePath: 'notes/rem.md',
      },
    ],
  };

  const mockRagRetrievalService = {
    retrieveHybridChunks: async () => ({
      rankedChunks: [
        {
          chunk: { noteId: 'note-10', chunkIndex: 0, chunkText: 'Step 1: build image.', similarity: 0.9 },
          note: { id: 'note-10', title: 'Deployment Specs', path: 'infra/deploy.md', projectSlug: 'infra' },
          hybridScore: 0.95,
        },
      ],
      noteMap: new Map(),
      validSyntheses: new Map(),
    }),
  };

  const mockRagContextAssemblerService = {
    buildAskContextResult: async () => ({
      contextChunks: [
        {
          noteId: 'note-10',
          title: 'Deployment Specs',
          path: 'infra/deploy.md',
          projectSlug: 'infra',
          chunkText: 'Step 1: build image.',
        },
      ],
      relatedNotes: [
        {
          id: 'note-10',
          title: 'Deployment Specs',
          path: 'infra/deploy.md',
          projectSlug: 'infra',
        },
      ],
    }),
  };

  const service = new AskAgentToolsService(
    mockRagRetrievalService,
    mockRagContextAssemblerService,
    mockContentRepository,
    dummyLogger,
    mockContentQueryRepository,
  );

  const tracker = new AgentContextTracker();
  const tools = service.buildTools(
    'user-1',
    { workspaceId: 'ws-1' },
    { provider: 'gemini', baseUrl: '', model: 'gemini-embedding-001', apiKey: 'key' },
    {
      candidateLimit: 16,
      minSimilarity: 0.45,
      hybridVectorWeight: 0.7,
      hybridKeywordWeight: 0.3,
      topChunksLimit: 10,
      rrfK: 20,
      recencyBonusEnabled: true,
      recencyMaxBonus: 0.008,
      recencyMaxBonusDays: 180,
    },
    tracker,
  );

  assert.equal(tools.length, 6);
  const toolNames = tools.map((t) => t.name);
  assert.ok(toolNames.includes('search_knowledge'));
  assert.ok(toolNames.includes('get_note_content'));
  assert.ok(toolNames.includes('list_projects'));
  assert.ok(toolNames.includes('list_recent_notes'));
  assert.ok(toolNames.includes('list_reminders'));
  assert.ok(toolNames.includes('list_note_attachments'));

  // Execute search_knowledge
  const searchTool = tools.find((t) => t.name === 'search_knowledge');
  const searchResult = await searchTool.execute({ query: 'deploy' });
  assert.equal(searchResult.resultsCount, 1);
  assert.equal(tracker.getSources().length, 1);

  // Execute get_note_content
  const getNoteTool = tools.find((t) => t.name === 'get_note_content');
  const noteResult = await getNoteTool.execute({ noteId: 'note-10' });
  assert.equal(noteResult.title, 'Deployment Specs');
  assert.ok(noteResult.content.includes('Step 1: build image'));

  // Execute list_projects
  const listProjectsTool = tools.find((t) => t.name === 'list_projects');
  const projectsResult = await listProjectsTool.execute({});
  assert.equal(projectsResult.projects.length, 1);
  assert.equal(projectsResult.projects[0].name, 'Infrastructure');

  // Execute list_recent_notes
  const listRecentTool = tools.find((t) => t.name === 'list_recent_notes');
  const recentResult = await listRecentTool.execute({ limit: 5 });
  assert.equal(recentResult.notes.length, 1);

  // Execute list_reminders
  const remindersTool = tools.find((t) => t.name === 'list_reminders');
  const remindersResult = await remindersTool.execute({ status: 'pending' });
  assert.equal(remindersResult.count, 1);
  assert.equal(remindersResult.reminders[0].title, 'Deploy to Prod');

  // Execute list_note_attachments
  const attachmentsTool = tools.find((t) => t.name === 'list_note_attachments');
  const attachmentsResult = await attachmentsTool.execute({ noteId: 'note-10' });
  assert.equal(attachmentsResult.attachmentsCount, 1);
  assert.equal(attachmentsResult.attachments[0].fileName, 'architecture.pdf');
});

test('AskKnowledgeUseCase delegates to AskAgentGateway when present', async () => {
  let agentCalled = false;
  const mockAgentGateway = {
    run: async (config, request, tools) => {
      agentCalled = true;
      assert.equal(request.question, 'Como funciona o deploy?');
      assert.equal(tools.length, 6);

      // Simulate agent calling search_knowledge tool
      const searchTool = tools.find((t) => t.name === 'search_knowledge');
      await searchTool.execute({ query: 'deploy' });

      return {
        answer: 'O deploy é feito via container Docker para staging primeiro.',
        confidence: ConversationConfidence.High,
        requestedAttachments: false,
        sources: [],
      };
    },
  };

  const mockContentRepository = {
    listWorkspaces: async () => [{ id: 'ws-1', workspaceSlug: 'default' }],
    getNotesByIds: async () => [],
    listProjects: async () => [],
    listNotes: async () => [],
  };

  const mockRagRetrievalService = {
    retrieveHybridChunks: async () => ({
      rankedChunks: [
        {
          chunk: { noteId: 'note-deploy', chunkIndex: 0, chunkText: 'Passo 1: docker build.', similarity: 0.9 },
          note: { id: 'note-deploy', title: 'Manual de Deploy', path: 'infra/deploy.md', projectSlug: 'infra' },
          hybridScore: 0.9,
        },
      ],
      noteMap: new Map(),
      validSyntheses: new Map(),
    }),
  };

  const mockRagContextAssemblerService = {
    buildAskContextResult: async () => ({
      contextChunks: [
        {
          noteId: 'note-deploy',
          title: 'Manual de Deploy',
          path: 'infra/deploy.md',
          chunkText: 'Passo 1: docker build.',
        },
      ],
      relatedNotes: [
        {
          id: 'note-deploy',
          title: 'Manual de Deploy',
          path: 'infra/deploy.md',
        },
      ],
    }),
  };

  const agentToolsService = new AskAgentToolsService(
    mockRagRetrievalService,
    mockRagContextAssemblerService,
    mockContentRepository,
    dummyLogger,
  );

  const useCase = new AgentAskKnowledgeUseCase(
    mockAgentGateway,
    agentToolsService,
    mockContentRepository,
    dummyRuntimeEnv,
    dummyLogger,
    dummyAiEntitlement,
  );

  const result = await useCase.execute('Como funciona o deploy?', 'user-1', {
    workspaceId: 'ws-1',
  });

  assert.equal(agentCalled, true);
  assert.equal(result.ok, true);
  assert.equal(result.answer, 'O deploy é feito via container Docker para staging primeiro.');
  assert.equal(result.confidence, ConversationConfidence.High);
  assert.equal(result.sources.length, 1);
  assert.equal(result.sources[0].title, 'Manual de Deploy');
  assert.equal(result.relatedNotes.length, 1);
});

test('AgentAskKnowledgeUseCase gracefully handles gateway throwing an error', async () => {
  const failingAgentGateway = {
    run: async () => {
      throw new Error('AI Provider rate limited (429)');
    },
  };

  const mockContentRepository = {
    listWorkspaces: async () => [{ id: 'ws-1', workspaceSlug: 'default' }],
  };

  const agentToolsService = {
    buildTools: () => [],
  };

  const useCase = new AgentAskKnowledgeUseCase(
    failingAgentGateway,
    agentToolsService,
    mockContentRepository,
    dummyRuntimeEnv,
    dummyLogger,
    dummyAiEntitlement,
  );

  const result = await useCase.execute('Alguma pergunta?', 'user-1', {
    workspaceId: 'ws-1',
  });

  assert.equal(result.ok, true);
  assert.equal(result.confidence, ConversationConfidence.Low);
  assert.ok(result.answer.includes('unable to generate an answer'));
  assert.equal(result.sources.length, 0);
});

test('AgentAskKnowledgeUseCase enriches agent-cited sources with title and path from tracker', async () => {
  const mockAgentGateway = {
    run: async (config, request, tools) => {
      // Simulate calling search_knowledge which loads note-1 and note-2 into tracker
      const searchTool = tools.find((t) => t.name === 'search_knowledge');
      await searchTool.execute({ query: 'test' });

      // Agent explicitly cites only note-1, but without title/path
      return {
        answer: 'Baseado no note 1...',
        confidence: ConversationConfidence.High,
        requestedAttachments: false,
        sources: [{ noteId: 'note-1', title: '', path: '' }],
      };
    },
  };

  const mockContentRepository = {
    listWorkspaces: async () => [{ id: 'ws-1', workspaceSlug: 'default' }],
  };

  const mockRagRetrievalService = {
    retrieveHybridChunks: async () => ({
      rankedChunks: [
        {
          chunk: { noteId: 'note-1', chunkIndex: 0, chunkText: 'Texto 1', similarity: 0.9 },
          note: { id: 'note-1', title: 'Nota Um', path: 'notes/1.md', projectSlug: 'p1' },
          hybridScore: 0.9,
        },
        {
          chunk: { noteId: 'note-2', chunkIndex: 0, chunkText: 'Texto 2', similarity: 0.8 },
          note: { id: 'note-2', title: 'Nota Dois', path: 'notes/2.md', projectSlug: 'p1' },
          hybridScore: 0.8,
        },
      ],
      noteMap: new Map(),
      validSyntheses: new Map(),
    }),
  };

  const mockRagContextAssemblerService = {
    buildAskContextResult: async () => ({
      contextChunks: [
        { noteId: 'note-1', title: 'Nota Um', path: 'notes/1.md', projectSlug: 'p1', chunkText: 'Texto 1' },
        { noteId: 'note-2', title: 'Nota Dois', path: 'notes/2.md', projectSlug: 'p1', chunkText: 'Texto 2' },
      ],
      relatedNotes: [],
    }),
  };

  const agentToolsService = new AskAgentToolsService(
    mockRagRetrievalService,
    mockRagContextAssemblerService,
    mockContentRepository,
    dummyLogger,
  );

  const useCase = new AgentAskKnowledgeUseCase(
    mockAgentGateway,
    agentToolsService,
    mockContentRepository,
    dummyRuntimeEnv,
    dummyLogger,
    dummyAiEntitlement,
  );

  const result = await useCase.execute('Pergunta teste', 'user-1', {
    workspaceId: 'ws-1',
  });

  assert.equal(result.ok, true);
  assert.equal(result.sources.length, 1);
  assert.equal(result.sources[0].noteId, 'note-1');
  assert.equal(result.sources[0].title, 'Nota Um');
  assert.equal(result.sources[0].path, 'notes/1.md');
});

test('parseAskAgentFinalResponse cleanly extracts answer when model outputs conversational text before json block', async () => {
  const { parseAskAgentFinalResponse } = await import('../../../dist/infrastructure/ai/prompts/ask-agent.prompt.js');

  const rawModelOutput = `Based on your notes, here is the answer:
The project uses PostgreSQL 16 and NestJS 11.

\`\`\`json
{
  "answer": "The project uses PostgreSQL 16 and NestJS 11.",
  "confidence": "high",
  "requestedAttachments": false,
  "sources": [{"noteId": "note-1", "title": "Tech Stack"}]
}
\`\`\``;

  const parsed = parseAskAgentFinalResponse(rawModelOutput);
  assert.equal(parsed.answer, 'The project uses PostgreSQL 16 and NestJS 11.');
  assert.equal(parsed.confidence, 'high');
  assert.equal(parsed.sources.length, 1);
  assert.equal(parsed.sources[0].noteId, 'note-1');
  assert.equal(parsed.answer.includes('{'), false);
  assert.equal(parsed.answer.includes('```'), false);
});

test('parseAskAgentFinalResponse removes redundant trailing JSON if leaked into the answer field', async () => {
  const { parseAskAgentFinalResponse } = await import('../../../dist/infrastructure/ai/prompts/ask-agent.prompt.js');

  const rawModelOutput = JSON.stringify({
    answer: `Here is your answer.\n\n\`\`\`json\n{\n  "answer": "Here is your answer.",\n  "confidence": "high"\n}\n\`\`\``,
    confidence: 'high',
    sources: [],
  });

  const parsed = parseAskAgentFinalResponse(rawModelOutput);
  assert.equal(parsed.answer, 'Here is your answer.');
  assert.equal(parsed.answer.includes('```json'), false);
});

test('parseAskAgentFinalResponse fallback strips raw json schema when model outputs text followed by raw json', async () => {
  const { parseAskAgentFinalResponse } = await import('../../../dist/infrastructure/ai/prompts/ask-agent.prompt.js');

  const rawModelOutput = `Meeting notes: discussed Q4 goals.
{
  "answer": "Meeting notes: discussed Q4 goals.",
  "confidence": "medium",
  "sources": []
}`;

  const parsed = parseAskAgentFinalResponse(rawModelOutput);
  assert.equal(parsed.answer, 'Meeting notes: discussed Q4 goals.');
  assert.equal(parsed.answer.includes('{'), false);
});


