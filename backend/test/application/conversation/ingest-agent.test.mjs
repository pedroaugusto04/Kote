import test from 'node:test';
import assert from 'node:assert/strict';

import {
  CreateProjectFolderUseCase,
  IngestEntryUseCase,
  ProcessAgentConversationUseCase,
} from '../../../dist/application/use-cases/index.js';
import { ConversationAgentPresenter } from '../../../dist/application/use-cases/conversation/services/conversation-agent.presenter.js';
import { ConversationFolderResolutionService } from '../../../dist/application/use-cases/conversation/services/conversation-folder-resolution.service.js';
import { IngestAgentToolsService } from '../../../dist/application/services/conversation/ingest-agent-tools.service.js';
import { AiEntitlementService } from '../../../dist/application/services/ai/ai-entitlement.service.js';
import { conversationAgentDecisionSchema, normalizeConversationAgentDecisionInput } from '../../../dist/contracts/agent-conversation.js';
import { createPostgresTestRepositories } from '../../helpers/postgres-test-repositories.mjs';

class StubIngestAgentGateway {
  constructor(handler) {
    this.handler = handler;
  }

  async decide(config, request, tools) {
    const rawDecision = await this.handler(config, request, tools);
    if (!rawDecision) return null;
    return conversationAgentDecisionSchema.parse(normalizeConversationAgentDecisionInput(structuredClone(rawDecision)));
  }
}

async function createFixture(t, handler) {
  const repositories = await createPostgresTestRepositories(t);
  const user = await repositories.createTestUser();
  const workspace = await repositories.contentRepository.upsertWorkspace(user.id, {
    workspaceSlug: 'default',
    displayName: 'Default',
    whatsappChatJid: '',
    telegramChatId: '',
    createdAt: '2026-05-06T00:00:00.000Z',
    updatedAt: '2026-05-06T00:00:00.000Z',
  });
  const platformProject = await repositories.contentRepository.upsertProject(user.id, {
    projectSlug: 'platform',
    displayName: 'Platform',
    repositories: [],
    workspaceId: workspace.id,
    workspaceSlug: 'default',
    defaultTags: ['backend'],
    enabled: true,
  });
  await repositories.contentRepository.upsertProject(user.id, {
    projectSlug: 'mobile-app',
    displayName: 'Mobile App',
    repositories: [],
    workspaceId: workspace.id,
    workspaceSlug: 'default',
    defaultTags: ['app'],
    enabled: true,
  });

  const createFolder = new CreateProjectFolderUseCase(repositories.contentRepository);
  const { folder: backendFolder } = await createFolder.execute({
    projectId: platformProject.id,
    displayName: 'Backend',
  }, user.id);

  await repositories.credentialRepository.upsertCredential({
    userId: user.id,
    workspaceSlug: 'default',
    provider: 'ai-conversation',
    status: 'connected',
    encryptedConfig: {},
    publicMetadata: {},
  });

  const environment = {
    read: () => ({
      conversationAiProvider: 'openrouter',
      conversationAiBaseUrl: 'https://example.com',
      conversationAiModel: 'test-model',
      conversationAiApiKey: 'test-key',
      reminderTimeZone: 'America/Sao_Paulo',
      conversationTimeoutMs: 600000,
    }),
  };

  const loggerMock = {
    info() {},
    warn() {},
    error() {},
    debug() {},
  };

  const ingest = new IngestEntryUseCase(
    repositories.contentRepository,
    repositories.runtimeEnvironmentProvider,
    repositories.noteLifecycleService,
    loggerMock,
    repositories.database,
  );
  const presenter = new ConversationAgentPresenter();
  const folderResolution = new ConversationFolderResolutionService(repositories.contentRepository, createFolder);
  const toolsService = new IngestAgentToolsService(repositories.contentRepository, loggerMock);
  const gateway = new StubIngestAgentGateway(handler);

  const agentUseCase = new ProcessAgentConversationUseCase(
    repositories.contentRepository,
    repositories.conversationStateRepository,
    ingest,
    environment,
    gateway,
    toolsService,
    presenter,
    folderResolution,
    new AiEntitlementService(repositories.credentialRepository, repositories.quotaService),
    loggerMock,
  );

  return { repositories, user, agentUseCase, platformProject, backendFolder };
}

function input(messageText) {
  return {
    messageText,
    senderId: '5511999999999@s.whatsapp.net',
    chatId: 'group@g.us',
    messageId: `msg-${Math.random()}`,
    hasMedia: false,
    media: {},
  };
}

test('AgentProcessConversationUseCase dynamically inspects projects and folders via ReAct tools', async (t) => {
  let toolCalls = [];

  const handler = async (_config, request, tools) => {
    // 1. Tool call: list_projects
    const listProjectsTool = tools.find((t) => t.name === 'list_projects');
    assert.ok(listProjectsTool, 'list_projects tool must be provided');
    const projectsResult = await listProjectsTool.execute({});
    toolCalls.push('list_projects');
    assert.ok(projectsResult.projects.some((p) => p.projectSlug === 'platform'));

    // 2. Tool call: list_project_folders
    const listFoldersTool = tools.find((t) => t.name === 'list_project_folders');
    assert.ok(listFoldersTool, 'list_project_folders tool must be provided');
    const foldersResult = await listFoldersTool.execute({ projectSlug: 'platform' });
    toolCalls.push('list_project_folders');
    const backendFolder = foldersResult.folders.find((f) => f.fullSlugPath === 'backend');
    assert.ok(backendFolder, 'backend folder must be found');

    // Return decision using the discovered folder ID
    return {
      action: 'submit',
      replyText: 'Salvo com sucesso na pasta backend do projeto platform.',
      selectedProjectSlug: 'platform',
      selectedFolderId: backendFolder.id,
      suggestedFolderPath: ['backend'],
      resolvedDraft: {
        rawText: request.messageText,
        title: 'Configurar pooling de conexão',
        kind: 'note',
        canonicalType: 'knowledge',
      },
      confidence: 'high',
    };
  };

  const { repositories, agentUseCase, user, backendFolder } = await createFixture(t, handler);

  const result = await agentUseCase.execute(
    input('Anote no projeto platform na pasta backend: configurar pooling de conexao com max 20 conexoes'),
    user.id,
    'default',
  );

  assert.equal(result.action, 'submit');
  assert.deepEqual(toolCalls, ['list_projects', 'list_project_folders']);
  assert.equal(result.agent.selectedProjectSlug, 'platform');
  assert.equal(result.agent.selectedFolderId, backendFolder.id);
  assert.ok(result.replyText.includes('Note saved successfully:'));
  assert.ok(result.replyText.includes('Folder: Backend'));
  assert.equal(result.ingestResult.note.folderId, backendFolder.id);
  assert.equal(result.ingestResult.note.folderPath, 'Backend');
  assert.equal(result.payload.content.rawText, 'Anote no projeto platform na pasta backend: configurar pooling de conexao com max 20 conexoes');
  const savedNote = await repositories.contentRepository.getNoteById(user.id, result.ingestResult.noteId);
  assert.ok(savedNote.markdown.includes('configurar pooling de conexao com max 20 conexoes'));
});

test('AgentProcessConversationUseCase preserves verbatim user text without unwanted rewriting', async (t) => {
  const verbatimText = 'const timeout = 5000;\n// TODO: verificar memory leak no worker de webhook';

  const handler = async (_config, request) => {
    return {
      action: 'submit',
      replyText: 'Nota gravada.',
      selectedProjectSlug: 'platform',
      placeInRoot: true,
      resolvedDraft: {
        rawText: request.messageText,
        title: 'Memory leak no worker',
        kind: 'bug',
        canonicalType: 'incident',
      },
      confidence: 'high',
    };
  };

  const { repositories, agentUseCase, user } = await createFixture(t, handler);

  const result = await agentUseCase.execute(
    input(verbatimText),
    user.id,
    'default',
  );

  assert.equal(result.action, 'submit');
  assert.equal(result.payload.content.rawText, verbatimText);
  const savedNote = await repositories.contentRepository.getNoteById(user.id, result.ingestResult.noteId);
  assert.ok(savedNote.markdown.includes(verbatimText));
});

test('AgentProcessConversationUseCase saves relative reminder ISO timestamp correctly', async (t) => {
  const reminderTime = '2026-10-15T15:00:00.000Z';

  const handler = async (_config, request) => {
    assert.equal(request.timeZone, 'America/Sao_Paulo');
    return {
      action: 'submit',
      replyText: 'Lembrete agendado para quinta-feira.',
      selectedProjectSlug: 'platform',
      placeInRoot: true,
      resolvedDraft: {
        rawText: request.messageText,
        title: 'Revisar certificados SSL',
        kind: 'reminder',
        canonicalType: 'event',
        reminderAt: reminderTime,
      },
      confidence: 'high',
    };
  };

  const { agentUseCase, user } = await createFixture(t, handler);

  const result = await agentUseCase.execute(
    input('me lembra na quinta-feira às 12h de revisar os certificados SSL'),
    user.id,
    'default',
  );

  assert.equal(result.action, 'submit');
  assert.equal(result.payload.actions.reminderAt, reminderTime);
  assert.equal(result.ingestResult.note.reminderAt, reminderTime);
  assert.equal(result.ingestResult.note.hasReminder, true);
});

test('AgentProcessConversationUseCase handles unavailable agent gateway gracefully', async (t) => {
  const handler = async () => null;

  const { agentUseCase, user } = await createFixture(t, handler);

  await assert.rejects(
    async () => agentUseCase.execute(input('uma nota qualquer'), user.id, 'default'),
    { message: 'conversation_agent_unavailable' },
  );
});
