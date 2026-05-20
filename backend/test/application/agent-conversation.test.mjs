import test from 'node:test';
import assert from 'node:assert/strict';

import {
  CreateProjectFolderUseCase,
  IngestEntryUseCase,
  ProcessAgentConversationUseCase,
} from '../../dist/application/use-cases/index.js';
import { ConversationAgentPresenter } from '../../dist/application/use-cases/conversation/services/conversation-agent.presenter.js';
import { ConversationFolderResolutionService } from '../../dist/application/use-cases/conversation/services/conversation-folder-resolution.service.js';
import { conversationAgentDecisionSchema, normalizeConversationAgentDecisionInput } from '../../dist/contracts/agent-conversation.js';
import { createPostgresTestRepositories } from '../helpers/postgres-test-repositories.mjs';

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
  await repositories.contentRepository.upsertWorkspace(user.id, {
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
    workspaceSlug: 'default',
    defaultTags: ['backend'],
    enabled: true,
  });
  await repositories.contentRepository.upsertProject(user.id, {
    projectSlug: 'mobile-app',
    displayName: 'Mobile App',
    repositories: [],
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

  const ingest = new IngestEntryUseCase(repositories.contentRepository, repositories.runtimeEnvironmentProvider);
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
    repositories.credentialRepository,
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
    pendingApproval: 'final_confirmation',
    confidence: 'high',
    action: 'confirm',
    ...overrides,
  };
}

test('agent conversation happy path suggests folder, asks final confirmation and saves with created folderId', async (t) => {
  const turns = new Map([
    ['corrigi timeout do endpoint de webhook', decision()],
  ]);
  const { repositories, agentUseCase, user } = await createFixture(t, turns);

  const first = await agentUseCase.execute(input('corrigi timeout do endpoint de webhook'), user.id, 'default');
  assert.equal(first.action, 'confirm');
  assert.equal(first.agent.pendingApproval, 'final_confirmation');
  assert.deepEqual(first.agent.suggestedFolderPath, ['Runbooks', 'API']);
  assert.match(first.replyText, /Confirm note saving/);
  assert.match(first.replyText, /new, will be created when saved/);

  const second = await agentUseCase.execute(input('sim'), user.id, 'default');
  assert.equal(second.action, 'submit');
  assert.equal(second.ingestResult.ok, true);
  const notes = await repositories.contentRepository.listNotes(user.id);
  assert.equal(notes.length, 1);
  const folders = await repositories.contentRepository.listProjectFolders(user.id, 'platform');
  const finalFolder = folders.find((folder) => folder.fullSlugPath === 'runbooks/api');
  assert.ok(finalFolder);
  assert.equal(notes[0].folderId, finalFolder.id);
});

test('agent conversation preserves media from the first message and saves it on final confirmation', async (t) => {
  const turns = new Map([
    ['corrigi timeout do endpoint de webhook', decision()],
  ]);
  const { repositories, agentUseCase, user } = await createFixture(t, turns);

  await agentUseCase.execute(mediaInput('corrigi timeout do endpoint de webhook'), user.id, 'default');
  const saved = await agentUseCase.execute(input('sim'), user.id, 'default');

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
  assert.match(first.replyText, /Tell me what it is.*which project I should save it to/);
  assert.equal(await repositories.countConversationStates(), 1);

  await agentUseCase.execute(input('corrigi timeout do endpoint de webhook'), user.id, 'default');
  const saved = await agentUseCase.execute(input('sim'), user.id, 'default');

  assert.equal(saved.action, 'submit');
  const attachments = await repositories.contentRepository.listAttachments(user.id, saved.ingestResult.noteId);
  assert.equal(attachments.length, 1);
  assert.equal((await repositories.objectStorage.get(attachments[0].storageKey)).toString('utf8'), 'hello image');
});

test('agent conversation asks for project when project choice is ambiguous', async (t) => {
  const turns = new Map([
    ['ajustei a pipeline', decision({ selectedProjectSlug: '', suggestedFolderPath: [], pendingApproval: 'none', action: 'ask', replyText: 'Qual projeto devo usar?' })],
  ]);
  const { agentUseCase, user } = await createFixture(t, turns);

  const result = await agentUseCase.execute(input('ajustei a pipeline'), user.id, 'default');
  assert.equal(result.action, 'ask');
  assert.equal(result.agent.selectedProjectSlug, '');
  assert.match(result.replyText, /Available projects/);
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
      pendingApproval: 'none',
      action: 'ask',
      confidence: 'low',
    })],
  ]);
  const { agentUseCase, user } = await createFixture(t, turns);

  const result = await agentUseCase.execute(input('???'), user.id, 'default');

  assert.equal(result.action, 'ask');
  assert.match(result.replyText, /I could not identify something useful to save yet/);
  assert.match(result.replyText, /notes, decisions, bugs, reminders, summaries, links, or media/);
  assert.match(result.replyText, /ask for confirmation before saving/);
});

test('agent conversation edits pending confirmation when the agent identifies a modification', async (t) => {
  const turns = new Map([
    ['documentei o checklist de deploy', decision({
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
    ['salva na raiz', decision({
      selectedProjectSlug: 'platform',
      selectedFolderId: '',
      suggestedFolderPath: [],
      placeInRoot: true,
      pendingApproval: 'final_confirmation',
      approvalIntent: 'unclear',
      turnIntent: 'modify_current',
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

  await agentUseCase.execute(input('documentei o checklist de deploy'), user.id, 'default');
  const rootConfirmation = await agentUseCase.execute(input('salva na raiz'), user.id, 'default');
  assert.equal(rootConfirmation.action, 'confirm');
  assert.match(rootConfirmation.replyText, /project root/);
  assert.match(rootConfirmation.replyText, /Documentei o checklist de deploy/);

  const saved = await agentUseCase.execute(input('sim'), user.id, 'default');
  assert.equal(saved.action, 'submit');
  const notes = await repositories.contentRepository.listNotes(user.id);
  assert.equal(notes.length, 1);
  assert.equal(notes[0].folderId, null);
});

test('agent conversation replaces pending confirmation when the agent identifies a new note', async (t) => {
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
      pendingApproval: 'final_confirmation',
      approvalIntent: 'unclear',
      turnIntent: 'new_capture',
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
  const replacementConfirmation = await agentUseCase.execute(input('corrigi o timeout do webhook novo'), user.id, 'default');
  assert.equal(replacementConfirmation.action, 'confirm');
  assert.match(replacementConfirmation.replyText, /Corrigi o timeout do webhook novo/);
  assert.doesNotMatch(replacementConfirmation.replyText, /Resumo antigo da reuniao/);

  const saved = await agentUseCase.execute(input('sim'), user.id, 'default');
  assert.equal(saved.action, 'submit');
  const notes = await repositories.contentRepository.listNotes(user.id);
  assert.equal(notes.length, 1);
  assert.equal(notes[0].summary, 'Corrigi o timeout do webhook novo');
});

test('agent conversation keeps nonexistent project, confirms creation and saves the note', async (t) => {
  const turns = new Map([
    ['fiz algo no projeto x', decision({
      selectedProjectSlug: 'projeto-x',
      pendingApproval: 'final_confirmation',
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
  assert.equal(result.action, 'confirm');
  assert.equal(result.agent.selectedProjectSlug, 'projeto-x');
  assert.match(result.replyText, /Project: projeto-x \(new, will be created when saved\)/);

  const saved = await agentUseCase.execute(input('sim'), user.id, 'default');
  assert.equal(saved.action, 'submit');
  const project = await repositories.contentRepository.getProjectBySlug(user.id, 'projeto-x');
  assert.ok(project);
  assert.equal(project.displayName, 'Projeto X');
  const notes = await repositories.contentRepository.listNotes(user.id);
  assert.equal(notes.length, 1);
  assert.equal(notes[0].projectSlug, 'projeto-x');
});

test('agent conversation clears state when final confirmation is denied', async (t) => {
  const turns = new Map([
    ['resumo da reuniao', decision({
      selectedProjectSlug: 'platform',
      selectedFolderId: '',
      suggestedFolderPath: [],
      pendingApproval: 'final_confirmation',
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
  assert.equal(first.agent.pendingApproval, 'final_confirmation');

  const denied = await agentUseCase.execute(input('nao'), user.id, 'default');
  assert.equal(denied.action, 'cancel');
  assert.equal((await repositories.contentRepository.listNotes(user.id)).length, 0);
  assert.equal(await repositories.countConversationStates(), 0);
});

test('agent conversation uses agent approval intent for natural final confirmation wording', async (t) => {
  const turns = new Map([
    ['resumo da reuniao', decision({
      selectedProjectSlug: 'platform',
      selectedFolderId: '',
      suggestedFolderPath: [],
      pendingApproval: 'final_confirmation',
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
      pendingApproval: 'final_confirmation',
      approvalIntent: 'approve',
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

  await agentUseCase.execute(input('resumo da reuniao'), user.id, 'default');
  const saved = await agentUseCase.execute(input('pode salvar'), user.id, 'default');

  assert.equal(saved.action, 'submit');
  assert.equal(saved.ingestResult.ok, true);
  assert.equal((await repositories.contentRepository.listNotes(user.id)).length, 1);
});

test('agent conversation persists multi-turn state and submits from final confirmation', async (t) => {
  const turns = new Map([
    ['alinhei o runbook do api gateway', decision()],
  ]);
  const { repositories, agentUseCase, user } = await createFixture(t, turns);

  await agentUseCase.execute(input('alinhei o runbook do api gateway'), user.id, 'default');
  assert.equal(await repositories.countConversationStates(), 1);

  const resume = await agentUseCase.execute(input('sim'), user.id, 'default');
  assert.equal(resume.action, 'submit');
  assert.equal(await repositories.countConversationStates(), 0);
});

test('agent conversation expires stale pending confirmations before accepting yes', async (t) => {
  const turns = new Map();
  const { repositories, agentUseCase, user } = await createFixture(t, turns);
  await repositories.conversationStateRepository.upsert(user.id, 'default', 'agent:group@g.us:5511999999999@s.whatsapp.net', {
    draft: {
      rawText: 'Mensagem antiga que nao deve ser salva',
      title: '',
      kind: 'note',
      canonicalType: 'event',
      importance: 'medium',
      tags: [],
      reminderDate: '',
      reminderTime: '',
    },
    media: {},
    project: { selectedProjectSlug: 'platform' },
    folder: { selectedFolderId: '', suggestedFolderPath: [], placeInRoot: true },
    pendingApproval: 'final_confirmation',
    lastQuestion: 'Confirm note saving:',
    lastUserMessage: 'Mensagem antiga que nao deve ser salva',
    lastAgentAction: 'confirm',
    confidence: 'high',
    updatedAt: '2000-01-01T00:00:00.000Z',
  });

  const result = await agentUseCase.execute(input('sim'), user.id, 'default');

  assert.equal(result.action, 'ask');
  assert.match(result.replyText, /no pending note to confirm/);
  assert.equal((await repositories.contentRepository.listNotes(user.id)).length, 0);
  assert.equal(await repositories.countConversationStates(), 0);
});

test('agent conversation accepts AI reminder kind alias and reaches final confirmation', async (t) => {
  const turns = new Map([
    ['me lembra de revisar o deploy amanha', decision({
      replyText: 'Vou confirmar o lembrete.',
      selectedProjectSlug: 'platform',
      selectedFolderId: '',
      suggestedFolderPath: [],
      pendingApproval: 'final_confirmation',
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

  assert.equal(result.action, 'confirm');
  assert.equal(result.agent.pendingApproval, 'final_confirmation');
  assert.match(result.replyText, /Confirm note saving/);
});

test('agent conversation saves reminders as pending on submission', async (t) => {
  const turns = new Map([
    ['me lembra de revisar o deploy amanha', decision({
      replyText: 'Vou confirmar o lembrete.',
      selectedProjectSlug: 'platform',
      selectedFolderId: '',
      suggestedFolderPath: [],
      pendingApproval: 'final_confirmation',
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

  await agentUseCase.execute(input('me lembra de revisar o deploy amanha'), user.id, 'default');
  const saved = await agentUseCase.execute(input('sim'), user.id, 'default');

  assert.equal(saved.action, 'submit');
  const notes = await repositories.contentRepository.listNotes(user.id);
  assert.equal(notes.length, 1);
  assert.equal(notes[0].status, 'pending');
  assert.equal(notes[0].metadata.reminderDate, '2026-05-20');
});
