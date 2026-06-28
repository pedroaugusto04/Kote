import test from 'node:test';
import assert from 'node:assert/strict';

import {
  CreateProjectFolderUseCase,
  IngestEntryUseCase,
  ProcessAgentConversationUseCase,
} from '../../../dist/application/use-cases/index.js';
import { ConversationAgentPresenter } from '../../../dist/application/use-cases/conversation/services/conversation-agent.presenter.js';
import { ConversationFolderResolutionService } from '../../../dist/application/use-cases/conversation/services/conversation-folder-resolution.service.js';
import { conversationAgentDecisionSchema, normalizeConversationAgentDecisionInput } from '../../../dist/contracts/agent-conversation.js';
import { createPostgresTestRepositories } from '../../helpers/postgres-test-repositories.mjs';

class StubConversationAgentGateway {
  constructor(turns) {
    this.turns = turns;
  }

  async decide(_config, payload) {
    const key = String(payload.messageText || '').trim().toLowerCase();
    const decision = this.turns.get(key);
    if (!decision) throw new Error(`missing_agent_decision:${key}`);
    return conversationAgentDecisionSchema.parse(normalizeConversationAgentDecisionInput(structuredClone(decision)));
  }
}

async function createFixture(t, turns) {
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
  await repositories.contentRepository.upsertProject(user.id, {
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
  );
  const createFolder = new CreateProjectFolderUseCase(repositories.contentRepository);
  const presenter = new ConversationAgentPresenter();
  const folderResolution = new ConversationFolderResolutionService(repositories.contentRepository, createFolder);
  const agentUseCase = new ProcessAgentConversationUseCase(
    repositories.contentRepository,
    repositories.conversationStateRepository,
    ingest,
    environment,
    new StubConversationAgentGateway(turns),
    presenter,
    folderResolution,
    repositories.quotaService,
    repositories.credentialRepository,
    loggerMock,
  );
  return { repositories, user, agentUseCase };
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

function mediaInput(messageText) {
  return {
    ...input(messageText),
    hasMedia: true,
    media: {
      fileName: 'erro.png',
      mimeType: 'image/png',
      sizeBytes: 11,
      dataBase64: Buffer.from('hello image').toString('base64'),
    },
  };
}

function decision(overrides = {}) {
  return {
    replyText: 'Precisamos confirmar alguns detalhes.',
    resolvedDraft: {
      rawText: 'Corrigir timeout do endpoint de webhook',
      title: '',
      kind: 'bug',
      canonicalType: 'incident',
      importance: 'high',
      tags: ['backend'],
      reminderDate: '',
      reminderTime: '',
    },
    selectedProjectSlug: 'platform',
    selectedFolderId: '',
    suggestedFolderPath: ['Runbooks', 'API'],
    confidence: 'high',
    action: 'confirm',
    ...overrides,
  };
}

test('agent conversation happy path suggests folder and saves with created folderId', async (t) => {
  const turns = new Map([
    ['corrigi timeout do endpoint de webhook', decision()],
  ]);
  const { repositories, agentUseCase, user } = await createFixture(t, turns);

  const first = await agentUseCase.execute(input('corrigi timeout do endpoint de webhook'), user.id, 'default');
  assert.equal(first.action, 'submit');
  assert.equal(first.ingestResult.ok, true);
  assert.deepEqual(first.agent.suggestedFolderPath, ['Runbooks', 'API']);
  const notes = await repositories.contentRepository.listNotes(user.id);
  assert.equal(notes.length, 1);
  const project = await repositories.contentRepository.getProjectBySlug(user.id, 'platform');
  const folders = await repositories.contentRepository.listProjectFolders(user.id, project.id);
  const finalFolder = folders.find((folder) => folder.fullSlugPath === 'runbooks/api');
  assert.ok(finalFolder);
  assert.equal(notes[0].folderId, finalFolder.id);
});

test('agent conversation preserves media from the first message and saves it immediately', async (t) => {
  const turns = new Map([
    ['corrigi timeout do endpoint de webhook', decision()],
  ]);
  const { repositories, agentUseCase, user } = await createFixture(t, turns);

  const saved = await agentUseCase.execute(mediaInput('corrigi timeout do endpoint de webhook'), user.id, 'default');

  assert.equal(saved.action, 'submit');
  assert.equal(saved.ingestResult.attachmentIds.length, 1);
  const attachments = await repositories.contentRepository.listAttachments(user.id, saved.ingestResult.noteId);
  assert.equal(attachments.length, 1);
  assert.equal(attachments[0].fileName, 'erro.png');
  assert.equal(attachments[0].mimeType, 'image/png');
  assert.match(attachments[0].storageKey, new RegExp(`^users/${user.id}/workspaces/default/attachments/${saved.ingestResult.noteId}/erro\\.png$`));
  assert.equal((await repositories.objectStorage.get(attachments[0].storageKey)).toString('utf8'), 'hello image');
});

test('agent conversation asks for context when the first message is only media', async (t) => {
  const turns = new Map([
    ['corrigi timeout do endpoint de webhook', decision()],
  ]);
  const { repositories, agentUseCase, user } = await createFixture(t, turns);

  const first = await agentUseCase.execute(mediaInput(''), user.id, 'default');
  assert.equal(first.action, 'ask');
  assert.match(first.replyText, /Send the context so I can organize and save it/);
  assert.equal(await repositories.countConversationStates(), 1);

  const saved = await agentUseCase.execute(input('corrigi timeout do endpoint de webhook'), user.id, 'default');

  assert.equal(saved.action, 'submit');
  const attachments = await repositories.contentRepository.listAttachments(user.id, saved.ingestResult.noteId);
  assert.equal(attachments.length, 1);
  assert.equal((await repositories.objectStorage.get(attachments[0].storageKey)).toString('utf8'), 'hello image');
});

test('agent conversation falls back to inbox when project choice is ambiguous', async (t) => {
  const turns = new Map([
    ['ajustei a pipeline', decision({ selectedProjectSlug: '', suggestedFolderPath: [], action: 'ask', replyText: 'Qual projeto devo usar?' })],
  ]);
  const { repositories, agentUseCase, user } = await createFixture(t, turns);

  const result = await agentUseCase.execute(input('ajustei a pipeline'), user.id, 'default');
  assert.equal(result.action, 'submit');
  assert.equal(result.agent.selectedProjectSlug, 'inbox');
  const notes = await repositories.contentRepository.listNotes(user.id);
  assert.equal(notes.length, 1);
  assert.equal(notes[0].projectSlug, 'inbox');
});

test('agent conversation explains how to use it when the message is not useful to save', async (t) => {
  const turns = new Map([
    ['???', decision({
      replyText: 'Nao entendi.',
      resolvedDraft: {
        rawText: '',
        title: '',
        kind: 'note',
        canonicalType: 'event',
        importance: 'low',
        tags: [],
        reminderDate: '',
        reminderTime: '',
      },
      selectedProjectSlug: '',
      selectedFolderId: '',
      suggestedFolderPath: [],
      action: 'ask',
      confidence: 'low',
    })],
  ]);
  const { agentUseCase, user } = await createFixture(t, turns);

  const result = await agentUseCase.execute(input('???'), user.id, 'default');

  assert.equal(result.action, 'ask');
  assert.match(result.replyText, /I could not identify something useful to save yet/);
  assert.match(result.replyText, /notes, decisions, bugs, reminders, summaries, links, or media/);
  assert.match(result.replyText, /infer the right project and folder/);
});

test('agent conversation saves root placement immediately when the agent selects project root', async (t) => {
  const turns = new Map([
    ['salva na raiz', decision({
      selectedProjectSlug: 'platform',
      selectedFolderId: '',
      suggestedFolderPath: [],
      placeInRoot: true,
      action: 'confirm',
      resolvedDraft: {
        rawText: 'Documentei o checklist de deploy',
        title: '',
        kind: 'summary',
        canonicalType: 'knowledge',
        importance: 'medium',
        tags: ['deploy'],
        reminderDate: '',
        reminderTime: '',
      },
    })],
  ]);
  const { repositories, agentUseCase, user } = await createFixture(t, turns);

  const saved = await agentUseCase.execute(input('salva na raiz'), user.id, 'default');
  assert.equal(saved.action, 'submit');
  const notes = await repositories.contentRepository.listNotes(user.id);
  assert.equal(notes.length, 1);
  assert.equal(notes[0].folderId, null);
});

test('agent conversation saves separate captures without waiting for confirmation state', async (t) => {
  const turns = new Map([
    ['resumo antigo da reuniao', decision({
      resolvedDraft: {
        rawText: 'Resumo antigo da reuniao',
        title: '',
        kind: 'summary',
        canonicalType: 'knowledge',
        importance: 'medium',
        tags: ['meeting'],
        reminderDate: '',
        reminderTime: '',
      },
    })],
    ['corrigi o timeout do webhook novo', decision({
      selectedProjectSlug: 'platform',
      selectedFolderId: '',
      suggestedFolderPath: ['Runbooks', 'API'],
      placeInRoot: false,
      action: 'confirm',
      resolvedDraft: {
        rawText: 'Corrigi o timeout do webhook novo',
        title: '',
        kind: 'bug',
        canonicalType: 'incident',
        importance: 'high',
        tags: ['backend'],
        reminderDate: '',
        reminderTime: '',
      },
    })],
  ]);
  const { repositories, agentUseCase, user } = await createFixture(t, turns);

  await agentUseCase.execute(input('resumo antigo da reuniao'), user.id, 'default');
  const saved = await agentUseCase.execute(input('corrigi o timeout do webhook novo'), user.id, 'default');
  assert.equal(saved.action, 'submit');
  const notes = await repositories.contentRepository.listNotes(user.id);
  assert.equal(notes.length, 2);
  assert.equal(notes.some((note) => note.summary === 'Resumo antigo da reuniao'), true);
  assert.equal(notes.some((note) => note.summary === 'Corrigi o timeout do webhook novo'), true);
});

test('agent conversation keeps nonexistent project, creates it and saves the note', async (t) => {
  const turns = new Map([
    ['fiz algo no projeto x', decision({
      selectedProjectSlug: 'projeto-x',
      suggestedFolderPath: [],
      action: 'confirm',
      replyText: 'Pode confirmar o projeto?',
      resolvedDraft: {
        rawText: 'Fiz algo no projeto x',
        title: '',
        kind: 'note',
        canonicalType: 'event',
        importance: 'medium',
        tags: [],
        reminderDate: '',
        reminderTime: '',
      },
    })],
  ]);
  const { repositories, agentUseCase, user } = await createFixture(t, turns);

  const result = await agentUseCase.execute(input('fiz algo no projeto x'), user.id, 'default');
  assert.equal(result.action, 'submit');
  assert.equal(result.agent.selectedProjectSlug, 'projeto-x');

  const project = await repositories.contentRepository.getProjectBySlug(user.id, 'projeto-x');
  assert.ok(project);
  assert.equal(project.displayName, 'Projeto X');
  const notes = await repositories.contentRepository.listNotes(user.id);
  assert.equal(notes.length, 1);
  assert.equal(notes[0].projectSlug, 'projeto-x');
});

test('agent conversation does not keep confirmation state after immediate save', async (t) => {
  const turns = new Map([
    ['resumo da reuniao', decision({
      selectedProjectSlug: 'platform',
      selectedFolderId: '',
      suggestedFolderPath: [],
      action: 'confirm',
      replyText: 'Vamos confirmar.',
      resolvedDraft: {
        rawText: 'Resumo da reuniao',
        title: '',
        kind: 'summary',
        canonicalType: 'knowledge',
        importance: 'medium',
        tags: ['meeting'],
        reminderDate: '',
        reminderTime: '',
      },
    })],
  ]);
  const { repositories, agentUseCase, user } = await createFixture(t, turns);

  const first = await agentUseCase.execute(input('resumo da reuniao'), user.id, 'default');
  assert.equal(first.action, 'submit');
  assert.equal((await repositories.contentRepository.listNotes(user.id)).length, 1);
  assert.equal(await repositories.countConversationStates(), 0);
});

test('agent conversation saves natural capture without waiting for approval intent', async (t) => {
  const turns = new Map([
    ['resumo da reuniao', decision({
      selectedProjectSlug: 'platform',
      selectedFolderId: '',
      suggestedFolderPath: [],
      action: 'confirm',
      replyText: 'Vamos confirmar.',
      resolvedDraft: {
        rawText: 'Resumo da reuniao',
        title: '',
        kind: 'summary',
        canonicalType: 'knowledge',
        importance: 'medium',
        tags: ['meeting'],
        reminderDate: '',
        reminderTime: '',
      },
    })],
    ['pode salvar', decision({
      selectedProjectSlug: 'platform',
      selectedFolderId: '',
      suggestedFolderPath: [],
      action: 'submit',
      replyText: '',
      resolvedDraft: {
        rawText: 'Resumo da reuniao',
        title: '',
        kind: 'summary',
        canonicalType: 'knowledge',
        importance: 'medium',
        tags: ['meeting'],
        reminderDate: '',
        reminderTime: '',
      },
    })],
  ]);
  const { repositories, agentUseCase, user } = await createFixture(t, turns);

  const saved = await agentUseCase.execute(input('resumo da reuniao'), user.id, 'default');

  assert.equal(saved.action, 'submit');
  assert.equal(saved.ingestResult.ok, true);
  assert.equal((await repositories.contentRepository.listNotes(user.id)).length, 1);
});

test('agent conversation clears state after immediate submission', async (t) => {
  const turns = new Map([
    ['alinhei o runbook do api gateway', decision()],
  ]);
  const { repositories, agentUseCase, user } = await createFixture(t, turns);

  const saved = await agentUseCase.execute(input('alinhei o runbook do api gateway'), user.id, 'default');
  assert.equal(saved.action, 'submit');
  assert.equal(await repositories.countConversationStates(), 0);
});

test('agent conversation accepts AI reminder kind alias and saves immediately', async (t) => {
  const turns = new Map([
    ['me lembra de revisar o deploy amanha', decision({
      replyText: 'Vou confirmar o lembrete.',
      selectedProjectSlug: 'platform',
      selectedFolderId: '',
      suggestedFolderPath: [],
      action: 'confirm',
      resolvedDraft: {
        rawText: 'Revisar o deploy',
        title: '',
        kind: 'reminder',
        canonicalType: 'event',
        importance: 'low',
        tags: ['deploy'],
        reminderDate: '2026-05-20',
        reminderTime: '',
      },
    })],
  ]);
  const { agentUseCase, user } = await createFixture(t, turns);

  const result = await agentUseCase.execute(input('me lembra de revisar o deploy amanha'), user.id, 'default');

  assert.equal(result.action, 'submit');
});

test('agent conversation saves reminders as pending immediately', async (t) => {
  const turns = new Map([
    ['me lembra de revisar o deploy amanha', decision({
      replyText: 'Vou confirmar o lembrete.',
      selectedProjectSlug: 'platform',
      selectedFolderId: '',
      suggestedFolderPath: [],
      action: 'confirm',
      resolvedDraft: {
        rawText: 'Revisar o deploy',
        title: '',
        kind: 'reminder',
        canonicalType: 'event',
        importance: 'low',
        tags: ['deploy'],
        reminderDate: '2026-05-20',
        reminderTime: '',
      },
    })],
  ]);
  const { repositories, agentUseCase, user } = await createFixture(t, turns);

  const saved = await agentUseCase.execute(input('me lembra de revisar o deploy amanha'), user.id, 'default');

  assert.equal(saved.action, 'submit');
  const notes = await repositories.contentRepository.listNotes(user.id);
  assert.equal(notes.length, 1);
  assert.equal(notes[0].status, 'pending');
  assert.equal(notes[0].reminderDate, '2026-05-20');
});
