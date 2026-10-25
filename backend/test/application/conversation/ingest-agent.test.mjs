import test from 'node:test';
import assert from 'node:assert/strict';

import {
  CreateProjectFolderUseCase,
  IngestEntryUseCase,
  ProcessAgentConversationUseCase,
  ListPaginatedRemindersUseCase,
  RefreshReminderStatusesUseCase,
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

async function createFixture(t, handler, askAgentToolsService, aiEntitlementOverride) {
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

  const createFolder = new CreateProjectFolderUseCase(repositories.contentRepository, repositories.scopeResolver);
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
    repositories.scopeResolver,
  );
  const presenter = new ConversationAgentPresenter();
  const folderResolution = new ConversationFolderResolutionService(repositories.contentRepository, createFolder, repositories.scopeResolver);
  const reminderList = new ListPaginatedRemindersUseCase(
    repositories.contentQueryRepository,
    new RefreshReminderStatusesUseCase(
      repositories.contentRepository,
      repositories.reminderDispatchRepository,
      repositories.runtimeEnvironmentProvider,
    ),
  );
  const toolsService = new IngestAgentToolsService(repositories.contentRepository, loggerMock, reminderList, createFolder, repositories.scopeResolver);
  const gateway = new StubIngestAgentGateway(handler);
  const aiEntitlement = aiEntitlementOverride || new AiEntitlementService(repositories.credentialRepository, repositories.quotaService);
  const knowledgeToolsService = askAgentToolsService || { buildTools: () => [] };

  const agentUseCase = new ProcessAgentConversationUseCase(
    repositories.contentRepository,
    repositories.conversationStateRepository,
    ingest,
    environment,
    gateway,
    toolsService,
    presenter,
    folderResolution,
    aiEntitlement,
    knowledgeToolsService,
    loggerMock,
  );

  const testAgentUseCase = {
    ...agentUseCase,
    execute: (paramsOrInput, userId = user.id, workspaceSlug = 'default', projectSlug) => {
      const params = (paramsOrInput && typeof paramsOrInput === 'object' && 'input' in paramsOrInput)
        ? paramsOrInput
        : { input: paramsOrInput, userId, workspaceSlug, projectSlug };
      return agentUseCase.execute(params);
    },
  };

  return { repositories, user, agentUseCase: testAgentUseCase, platformProject, backendFolder, toolsService, aiEntitlement };
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
      action: 'capture',
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
      action: 'capture',
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
    assert.equal(request.timeZoneOffset, '-03:00');
    return {
      action: 'capture',
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

test('AgentProcessConversationUseCase uses semantic search tools and returns a standard answer without saving a note', async (t) => {
  const knowledgeToolsService = {
    buildTools(_userId, _scope, _embeddingConfig, _ragConfig, tracker) {
      return [{
        name: 'search_knowledge',
        description: 'Search knowledge',
        parameters: { type: 'object', properties: { query: { type: 'string' } }, required: ['query'] },
        async execute({ query }) {
          this.calls = (this.calls || 0) + 1;
          tracker.addSource({ noteId: 'source-1', title: 'Deploy', path: 'deploy.md' });
          tracker.addRelatedNote({ id: 'source-1', title: 'Deploy', path: 'deploy.md' });
          return { query, excerpts: ['A resposta está na nota de deploy.'] };
        },
      }];
    },
  };
  const handler = async (_config, request, tools) => {
    const searchTool = tools.find((tool) => tool.name === 'search_knowledge');
    assert.ok(searchTool, 'semantic search tool must be available to the conversation agent');
    const first = await searchTool.execute({ query: request.messageText });
    const second = await searchTool.execute({ query: 'deploy' });
    assert.match(first.excerpts[0], /nota de deploy/);
    assert.equal(second.query, 'deploy');
    return {
      action: 'reply',
      replyText: 'A resposta está na nota de deploy.',
      resolvedDraft: { rawText: '', title: '' },
      confidence: 'high',
    };
  };
  const { repositories, agentUseCase, user, aiEntitlement } = await createFixture(t, handler, knowledgeToolsService);
  const chargedOperations = [];
  const originalCheckAndConsume = aiEntitlement.checkAndConsume.bind(aiEntitlement);
  aiEntitlement.checkAndConsume = async (charge) => {
    chargedOperations.push(charge.operation);
    return originalCheckAndConsume(charge);
  };

  const result = await agentUseCase.execute(input('O que decidimos sobre o deploy?'), user.id, 'default');

  assert.equal(result.action, 'answer');
  assert.equal(result.replyText, 'A resposta está na nota de deploy.');
  assert.deepEqual(result.answerContext.sources, [{ noteId: 'source-1', title: 'Deploy', path: 'deploy.md' }]);
  assert.deepEqual(chargedOperations, ['agent_conversation_turn']);
  assert.equal((await repositories.contentRepository.listNotes(user.id)).length, 0);
});

test('reschedule_reminder reopens sent reminders at the new future time', async (t) => {
  const handler = async (_config, request) => ({
    action: 'capture',
    replyText: 'Lembrete criado.',
    selectedProjectSlug: 'platform',
    placeInRoot: true,
    resolvedDraft: {
      rawText: request.messageText,
      title: 'Revisar deploy',
      kind: 'note',
      canonicalType: 'followup',
      reminderAt: new Date(Date.now() + 60_000).toISOString(),
    },
    confidence: 'high',
  });
  const { repositories, agentUseCase, toolsService, user } = await createFixture(t, handler);
  const created = await agentUseCase.execute(input('me lembre de revisar deploy'), user.id, 'default');
  await repositories.contentRepository.updateReminderStatus(user.id, created.ingestResult.noteId, 'sent');
  const tools = toolsService.buildTools(user.id, 'default');
  const listed = await tools.find((tool) => tool.name === 'list_reminders').execute({});
  const reminder = listed.items.find((item) => item.id === created.ingestResult.noteId);
  const nextReminderAt = new Date(Date.now() + 3_600_000).toISOString();

  const result = await tools.find((tool) => tool.name === 'reschedule_reminder').execute({
    reminderId: reminder.id,
    reminderAt: nextReminderAt,
  });

  assert.equal(result.ok, true);
  const updated = await repositories.contentRepository.getNoteById(user.id, reminder.id);
  assert.equal(updated.reminderAt, nextReminderAt);
  assert.equal(updated.status, 'pending');

  // Verify that listing reminders after rescheduling keeps status as pending (does not revert to sent)
  const relisted = await tools.find((tool) => tool.name === 'list_reminders').execute({ status: 'all' });
  const relistedItem = relisted.items.find((item) => item.id === created.ingestResult.noteId);
  assert.equal(relistedItem.status, 'pending');
});

test('reschedule_reminder tool respects user timezone when rescheduling', async (t) => {
  const handler = async (_config, request) => ({
    action: 'capture',
    replyText: 'Lembrete criado.',
    selectedProjectSlug: 'platform',
    placeInRoot: true,
    resolvedDraft: {
      rawText: request.messageText,
      title: 'Preencher planilha de férias Sydle',
      kind: 'note',
      canonicalType: 'followup',
      reminderAt: '2026-10-24T12:00:00.000Z',
    },
    confidence: 'high',
  });
  const { repositories, agentUseCase, toolsService, user } = await createFixture(t, handler);
  const created = await agentUseCase.execute(input('lembrete de ferias da sydle'), user.id, 'default');
  const tools = toolsService.buildTools(user.id, 'default', 'America/Sao_Paulo');

  // Reschedule using local datetime string without offset: "2028-10-24T14:00:00"
  // 14:00 in America/Sao_Paulo (-03:00) must be stored as 17:00:00.000Z in UTC
  const rescheduleTool = tools.find((tool) => tool.name === 'reschedule_reminder');
  const result = await rescheduleTool.execute({
    reminderId: created.ingestResult.noteId,
    reminderAt: '2028-10-24T14:00:00',
  });

  assert.equal(result.ok, true);
  assert.equal(result.reminderAt, '2028-10-24T17:00:00.000Z');
  assert.equal(result.formattedReminderAt, '2028-10-24 14:00:00');

  const updatedNote = await repositories.contentRepository.getNoteById(user.id, created.ingestResult.noteId);
  assert.equal(updatedNote.reminderAt, '2028-10-24T17:00:00.000Z');

  // List reminders tool should include formattedReminderAt in user timezone
  const listTool = tools.find((tool) => tool.name === 'list_reminders');
  const listResult = await listTool.execute({ query: 'Sydle', status: 'all' });
  assert.equal(listResult.items.length, 1);
  assert.equal(listResult.items[0].reminderAt, '2028-10-24T17:00:00.000Z');
  assert.equal(listResult.items[0].formattedReminderAt, '2028-10-24 14:00:00');
});

test('update_reminder_status resolves and archives reminders from agent tool', async (t) => {
  const handler = async (_config, request) => ({
    action: 'capture',
    replyText: 'Lembrete criado.',
    selectedProjectSlug: 'platform',
    placeInRoot: true,
    resolvedDraft: {
      rawText: request.messageText,
      title: 'Comprar cafe',
      kind: 'note',
      canonicalType: 'followup',
      reminderAt: new Date(Date.now() + 60_000).toISOString(),
    },
    confidence: 'high',
  });
  const { repositories, agentUseCase, toolsService, user } = await createFixture(t, handler);
  const created = await agentUseCase.execute(input('me lembre de comprar cafe'), user.id, 'default');
  const tools = toolsService.buildTools(user.id, 'default');
  const updateTool = tools.find((tool) => tool.name === 'update_reminder_status');
  assert.ok(updateTool);

  // Mark as resolved
  const resolveResult = await updateTool.execute({
    reminderId: created.ingestResult.noteId,
    status: 'resolved',
  });
  assert.equal(resolveResult.ok, true);
  assert.equal(resolveResult.status, 'resolved');
  const resolvedNote = await repositories.contentRepository.getNoteById(user.id, created.ingestResult.noteId);
  assert.equal(resolvedNote.status, 'resolved');

  // Mark as archived
  const archiveResult = await updateTool.execute({
    reminderId: created.ingestResult.noteId,
    status: 'archived',
  });
  assert.equal(archiveResult.ok, true);
  assert.equal(archiveResult.status, 'archived');
  const archivedNote = await repositories.contentRepository.getNoteById(user.id, created.ingestResult.noteId);
  assert.equal(archivedNote.status, 'archived');
});

test('list_reminders filters by text and status and returns a stable page', async (t) => {
  const handler = async (_config, request) => ({
    action: 'capture',
    replyText: 'Lembrete criado.',
    selectedProjectSlug: 'platform',
    placeInRoot: true,
    resolvedDraft: {
      rawText: request.messageText,
      title: request.messageText,
      kind: 'note',
      canonicalType: 'followup',
      reminderAt: new Date(Date.now() + 86_400_000).toISOString(),
    },
    confidence: 'high',
  });
  const { repositories, agentUseCase, toolsService, user } = await createFixture(t, handler);
  const first = await agentUseCase.execute(input('Review API deployment'), user.id, 'default');
  const second = await agentUseCase.execute(input('Review mobile release'), user.id, 'default');
  await agentUseCase.execute(input('Prepare quarterly budget'), user.id, 'default');
  await repositories.contentRepository.updateReminderStatus(user.id, first.ingestResult.noteId, 'sent');

  const list = toolsService.buildTools(user.id, 'default').find((tool) => tool.name === 'list_reminders');
  const firstPage = await list.execute({ query: 'review', status: 'all', page: 1, pageSize: 1 });
  const secondPage = await list.execute({ query: 'review', status: 'all', page: 2, pageSize: 1 });
  const sentOnly = await list.execute({ query: 'review', status: 'sent' });
  const outsideDateRange = await list.execute({
    query: 'review',
    status: 'all',
    dueAfter: new Date(Date.now() + 2 * 86_400_000).toISOString(),
  });

  assert.equal(firstPage.pagination.total, 2);
  assert.equal(firstPage.pagination.hasNext, true);
  assert.equal(firstPage.items.length, 1);
  assert.equal(secondPage.items.length, 1);
  assert.notEqual(firstPage.items[0].id, secondPage.items[0].id);
  assert.equal(sentOnly.pagination.total, 1);
  assert.equal(sentOnly.items[0].id, first.ingestResult.noteId);
  assert.equal(sentOnly.items.some((item) => item.id === second.ingestResult.noteId), false);
  assert.equal(outsideDateRange.pagination.total, 0);
});

test('agent carries only the pending clarification into the next turn and captures the original request', async (t) => {
  const reminderAt = new Date(Date.now() + 86_400_000).toISOString();
  const handler = async (_config, request) => {
    if (request.messageText === 'me lembre de revisar o deploy') {
      return {
        action: 'clarify',
        replyText: 'Para quando devo marcar o lembrete?',
        selectedProjectSlug: 'platform',
        resolvedDraft: {
          rawText: request.messageText,
          title: 'Revisar o deploy',
          kind: 'note',
          canonicalType: 'followup',
          reminderAt: '',
        },
        confidence: 'high',
      };
    }

    assert.equal(request.pendingClarification?.originalRequest, 'me lembre de revisar o deploy');
    assert.equal(request.pendingClarification?.question, 'Para quando devo marcar o lembrete?');
    return {
      action: 'capture',
      replyText: 'Lembrete agendado.',
      selectedProjectSlug: request.pendingClarification.projectSlug,
      resolvedDraft: {
        ...request.pendingClarification.draft,
        rawText: request.pendingClarification.originalRequest,
        reminderAt,
      },
      confidence: 'high',
    };
  };
  const { repositories, agentUseCase, user } = await createFixture(t, handler);

  const clarification = await agentUseCase.execute(input('me lembre de revisar o deploy'), user.id, 'default');
  assert.equal(clarification.action, 'ask');
  const saved = await agentUseCase.execute(input('amanhã às 10'), user.id, 'default');

  assert.equal(saved.action, 'submit');
  assert.equal(saved.payload.content.rawText, 'me lembre de revisar o deploy');
  assert.equal(saved.ingestResult.note.reminderAt, reminderAt);
  assert.equal((await repositories.contentRepository.listNotes(user.id)).length, 1);
});

test('an unrelated reply clears pending clarification data before the next capture', async (t) => {
  const handler = async (_config, request) => {
    if (request.messageText === 'me lembre de revisar o deploy') {
      return {
        action: 'clarify',
        replyText: 'Para quando devo marcar o lembrete?',
        resolvedDraft: {
          rawText: request.messageText,
          title: 'Revisar o deploy',
          kind: 'note',
          canonicalType: 'followup',
          reminderAt: new Date(Date.now() + 86_400_000).toISOString(),
        },
        confidence: 'high',
      };
    }
    if (request.messageText === 'qual foi a decisão da API?') {
      assert.ok(request.pendingClarification);
      return { action: 'reply', replyText: 'A decisão foi manter a API atual.', confidence: 'high' };
    }
    assert.equal(request.pendingClarification, undefined);
    return {
      action: 'capture',
      replyText: 'Nota salva.',
      resolvedDraft: {
        rawText: request.messageText,
        title: 'Nota independente',
        kind: 'note',
        canonicalType: 'knowledge',
        reminderAt: '',
      },
      confidence: 'high',
    };
  };
  const { repositories, agentUseCase, user } = await createFixture(t, handler);

  await agentUseCase.execute(input('me lembre de revisar o deploy'), user.id, 'default');
  const answer = await agentUseCase.execute(input('qual foi a decisão da API?'), user.id, 'default');
  assert.equal(answer.action, 'answer');
  const saved = await agentUseCase.execute(input('documentei o contrato novo'), user.id, 'default');

  assert.equal(saved.action, 'submit');
  assert.equal(saved.payload.content.rawText, 'documentei o contrato novo');
  assert.equal(saved.ingestResult.note.reminderAt, '');
  assert.equal((await repositories.contentRepository.listNotes(user.id)).length, 1);
});

test('create_project_folder creates root and nested folders in a project', async (t) => {
  let createdRootFolder;
  let createdNestedFolder;

  const handler = async (_config, _request, tools) => {
    const createFolderTool = tools.find((tool) => tool.name === 'create_project_folder');
    assert.ok(createFolderTool, 'create_project_folder tool must be provided');

    // Root folder creation
    const rootResult = await createFolderTool.execute({
      projectSlug: 'platform',
      folderName: 'Reuniões',
    });
    assert.equal(rootResult.ok, true);
    assert.equal(rootResult.folder.displayName, 'Reuniões');
    assert.equal(rootResult.folder.parentFolderId ?? null, null);
    assert.equal(rootResult.folder.projectSlug, 'platform');
    createdRootFolder = rootResult.folder;

    // Nested folder creation
    const nestedResult = await createFolderTool.execute({
      projectSlug: 'platform',
      folderName: 'Daily',
      parentFolderId: rootResult.folder.id,
    });
    assert.equal(nestedResult.ok, true);
    assert.equal(nestedResult.folder.displayName, 'Daily');
    assert.equal(nestedResult.folder.parentFolderId, rootResult.folder.id);
    assert.equal(nestedResult.folder.fullSlugPath, `${rootResult.folder.folderSlug}/daily`);
    createdNestedFolder = nestedResult.folder;

    // Error handling: non-existent project
    const notFoundResult = await createFolderTool.execute({
      projectSlug: 'non-existent',
      folderName: 'Test',
    });
    assert.ok(notFoundResult.error);

    // Error handling: inbox project
    const inboxResult = await createFolderTool.execute({
      projectSlug: 'inbox',
      folderName: 'Test',
    });
    assert.ok(inboxResult.error);

    return {
      action: 'reply',
      replyText: 'Pastas criadas com sucesso.',
      confidence: 'high',
    };
  };

  const { agentUseCase, user } = await createFixture(t, handler);
  const result = await agentUseCase.execute(
    input('Crie a pasta Reuniões e a subpasta Daily no projeto platform'),
    user.id,
    'default',
  );

  assert.equal(result.action, 'answer');
  assert.equal(result.replyText, 'Pastas criadas com sucesso.');
  assert.ok(createdRootFolder);
  assert.ok(createdNestedFolder);
});

test('multi-turn question conversation passes recentTurns sliding window to gateway', async (t) => {
  const recordedTurnsHistory = [];

  const handler = async (_config, request) => {
    recordedTurnsHistory.push(request.recentTurns ? structuredClone(request.recentTurns) : []);

    if (request.messageText === 'Como funciona o deploy?') {
      return {
        action: 'reply',
        replyText: 'O deploy usa Docker e GitHub Actions.',
        confidence: 'high',
      };
    }

    if (request.messageText === 'E onde fica o Dockerfile?') {
      return {
        action: 'reply',
        replyText: 'Fica na raiz do projeto platform.',
        confidence: 'high',
      };
    }

    if (request.messageText === 'Tem documentação?') {
      return {
        action: 'reply',
        replyText: 'Sim, na pasta docs.',
        confidence: 'high',
      };
    }

    return { action: 'reply', replyText: 'Ok', confidence: 'high' };
  };

  const { agentUseCase, user } = await createFixture(t, handler);

  // Turn 1
  const res1 = await agentUseCase.execute(input('Como funciona o deploy?'), user.id, 'default');
  assert.equal(res1.action, 'answer');
  assert.equal(res1.replyText, 'O deploy usa Docker e GitHub Actions.');

  // Turn 2
  const res2 = await agentUseCase.execute(input('E onde fica o Dockerfile?'), user.id, 'default');
  assert.equal(res2.action, 'answer');
  assert.equal(res2.replyText, 'Fica na raiz do projeto platform.');

  // Turn 3
  const res3 = await agentUseCase.execute(input('Tem documentação?'), user.id, 'default');
  assert.equal(res3.action, 'answer');
  assert.equal(res3.replyText, 'Sim, na pasta docs.');

  // Verify history passed into gateway on each turn
  assert.equal(recordedTurnsHistory.length, 3);
  // Turn 1 had no prior turns
  assert.deepEqual(recordedTurnsHistory[0], []);
  // Turn 2 had Turn 1
  assert.deepEqual(recordedTurnsHistory[1], [
    {
      userMessage: 'Como funciona o deploy?',
      agentReply: 'O deploy usa Docker e GitHub Actions.',
    },
  ]);
  // Turn 3 had Turn 1 and Turn 2
  assert.deepEqual(recordedTurnsHistory[2], [
    {
      userMessage: 'Como funciona o deploy?',
      agentReply: 'O deploy usa Docker e GitHub Actions.',
    },
    {
      userMessage: 'E onde fica o Dockerfile?',
      agentReply: 'Fica na raiz do projeto platform.',
    },
  ]);
});

