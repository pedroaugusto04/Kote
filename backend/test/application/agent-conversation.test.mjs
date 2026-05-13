import test from 'node:test';
import assert from 'node:assert/strict';

import {
  CreateProjectFolderUseCase,
  IngestEntryUseCase,
  ProcessAgentConversationUseCase,
  ProcessConversationUseCase,
} from '../../dist/application/use-cases/index.js';
import { createPostgresTestRepositories } from '../helpers/postgres-test-repositories.mjs';

class StubConversationAgentGateway {
  constructor(turns) {
    this.turns = turns;
  }

  async decide(_config, payload) {
    const key = String(payload.messageText || '').trim().toLowerCase();
    const decision = this.turns.get(key);
    if (!decision) throw new Error(`missing_agent_decision:${key}`);
    return structuredClone(decision);
  }
}

async function createFixture(t, turns) {
  const repositories = await createPostgresTestRepositories(t);
  const user = await repositories.createTestUser();
  await repositories.contentRepository.upsertWorkspace(user.id, {
    workspaceSlug: 'default',
    displayName: 'Default',
    whatsappGroupJid: '',
    telegramChatId: '',
    createdAt: '2026-05-06T00:00:00.000Z',
    updatedAt: '2026-05-06T00:00:00.000Z',
  });
  await repositories.contentRepository.upsertProject(user.id, {
    projectSlug: 'platform',
    displayName: 'Platform',
    repositories: [],
    workspaceSlug: 'default',
    aliases: ['plataforma'],
    defaultTags: ['backend'],
    enabled: true,
  });
  await repositories.contentRepository.upsertProject(user.id, {
    projectSlug: 'mobile-app',
    displayName: 'Mobile App',
    repositories: [],
    workspaceSlug: 'default',
    aliases: ['mobile'],
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
  const agentUseCase = new ProcessAgentConversationUseCase(
    repositories.contentRepository,
    repositories.conversationStateRepository,
    ingest,
    createFolder,
    environment,
    new StubConversationAgentGateway(turns),
    repositories.credentialRepository,
  );
  const legacyUseCase = new ProcessConversationUseCase(
    repositories.contentRepository,
    repositories.contentQueryRepository,
    repositories.conversationStateRepository,
    ingest,
    environment,
    { extract: async () => null },
    repositories.credentialRepository,
  );
  return { repositories, user, agentUseCase, legacyUseCase };
}

function input(messageText) {
  return {
    messageText,
    senderId: '5511999999999@s.whatsapp.net',
    groupId: 'group@g.us',
    messageId: `msg-${Math.random()}`,
    hasMedia: false,
    media: {},
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
    pendingApproval: 'folder_create',
    confidence: 'high',
    action: 'confirm',
    ...overrides,
  };
}

test('agent conversation happy path suggests folder, gets approval, asks final confirmation and saves with folderId', async (t) => {
  const turns = new Map([
    ['corrigi timeout do endpoint de webhook', decision()],
  ]);
  const { repositories, agentUseCase, user } = await createFixture(t, turns);

  const first = await agentUseCase.execute(input('corrigi timeout do endpoint de webhook'), user.id, 'default');
  assert.equal(first.action, 'confirm');
  assert.equal(first.agent.pendingApproval, 'folder_create');
  assert.deepEqual(first.agent.suggestedFolderPath, ['Runbooks', 'API']);

  const second = await agentUseCase.execute(input('sim'), user.id, 'default');
  assert.equal(second.action, 'create_and_confirm');
  assert.equal(second.agent.pendingApproval, 'final_confirmation');
  assert.match(second.replyText, /Confirme o salvamento da nota/);

  const third = await agentUseCase.execute(input('sim'), user.id, 'default');
  assert.equal(third.action, 'submit');
  assert.equal(third.ingestResult.ok, true);
  const notes = await repositories.contentRepository.listNotes(user.id);
  assert.equal(notes.length, 1);
  const folders = await repositories.contentRepository.listProjectFolders(user.id, 'platform');
  const finalFolder = folders.find((folder) => folder.fullSlugPath === 'runbooks/api');
  assert.ok(finalFolder);
  assert.equal(notes[0].folderId, finalFolder.id);
});

test('agent conversation asks for project when project choice is ambiguous', async (t) => {
  const turns = new Map([
    ['ajustei a pipeline', decision({ selectedProjectSlug: '', suggestedFolderPath: [], pendingApproval: 'none', action: 'ask', replyText: 'Qual projeto devo usar?' })],
  ]);
  const { agentUseCase, user } = await createFixture(t, turns);

  const result = await agentUseCase.execute(input('ajustei a pipeline'), user.id, 'default');
  assert.equal(result.action, 'ask');
  assert.equal(result.agent.selectedProjectSlug, '');
  assert.match(result.replyText, /Projetos disponiveis/);
});

test('agent conversation rejected folder suggestion falls back to project root on final confirmation', async (t) => {
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
  ]);
  const { repositories, agentUseCase, user } = await createFixture(t, turns);

  await agentUseCase.execute(input('documentei o checklist de deploy'), user.id, 'default');
  const rejectFolder = await agentUseCase.execute(input('nao'), user.id, 'default');
  assert.equal(rejectFolder.action, 'confirm');
  assert.match(rejectFolder.replyText, /raiz do projeto/);

  const saved = await agentUseCase.execute(input('sim'), user.id, 'default');
  assert.equal(saved.action, 'submit');
  const notes = await repositories.contentRepository.listNotes(user.id);
  assert.equal(notes.length, 1);
  assert.equal(notes[0].folderId, null);
});

test('agent conversation refuses nonexistent project and asks for an existing project or inbox', async (t) => {
  const turns = new Map([
    ['fiz algo no projeto x', decision({ selectedProjectSlug: 'projeto-x', pendingApproval: 'none', suggestedFolderPath: [], action: 'ask', replyText: 'Pode confirmar o projeto?' })],
  ]);
  const { agentUseCase, user } = await createFixture(t, turns);

  const result = await agentUseCase.execute(input('fiz algo no projeto x'), user.id, 'default');
  assert.equal(result.action, 'ask');
  assert.equal(result.agent.selectedProjectSlug, '');
  assert.match(result.replyText, /Projetos disponiveis/);
  assert.doesNotMatch(result.replyText, /projeto-x/);
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

test('agent conversation persists multi-turn state and resumes from the right approval step', async (t) => {
  const turns = new Map([
    ['alinhei o runbook do api gateway', decision()],
  ]);
  const { repositories, agentUseCase, user } = await createFixture(t, turns);

  await agentUseCase.execute(input('alinhei o runbook do api gateway'), user.id, 'default');
  assert.equal(await repositories.countConversationStates(), 1);

  const resume = await agentUseCase.execute(input('sim'), user.id, 'default');
  assert.equal(resume.agent.pendingApproval, 'final_confirmation');
  assert.match(resume.replyText, /Confirme o salvamento/);
});

test('legacy conversation flow still works unchanged alongside agent flow', async (t) => {
  const { repositories, legacyUseCase, user } = await createFixture(t, new Map());

  const step1 = await legacyUseCase.execute(input('corrigi timeout no webhook'), user.id, 'default');
  assert.equal(step1.action, 'reply');
  assert.match(step1.replyText, /Qual o tipo da nota/);

  await legacyUseCase.execute(input('2'), user.id, 'default');
  await legacyUseCase.execute(input('platform'), user.id, 'default');
  await legacyUseCase.execute(input('9'), user.id, 'default');
  const step5 = await legacyUseCase.execute(input('sim'), user.id, 'default');

  assert.equal(step5.action, 'submit');
  assert.equal((await repositories.contentRepository.listNotes(user.id)).length, 1);
});
