import test from 'node:test';
import assert from 'node:assert/strict';

import {
  CreateProjectFolderUseCase,
  HandleWhatsappWebhookUseCase,
  IngestEntryUseCase,
  ProcessAgentConversationUseCase,
  ProcessConversationUseCase,
} from '../../dist/application/use-cases/index.js';
import { createPostgresTestRepositories } from '../helpers/postgres-test-repositories.mjs';

class CapturingWhatsappSender {
  constructor(ok = true) {
    this.ok = ok;
    this.sent = [];
  }

  async sendText(input) {
    this.sent.push(input);
    return this.ok ? { ok: true } : { ok: false, error: 'send_failed' };
  }
}

class StubConversationAgentGateway {
  async decide(_config, payload) {
    const message = String(payload.messageText || '').trim().toLowerCase();
    if (message === 'corrigi timeout no webhook') {
      return {
        replyText: 'Sugestao de pasta para n8n-automations: Webhooks / Operacao. Posso criar essa estrutura antes de salvar a nota?',
        resolvedDraft: {
          rawText: 'corrigi timeout no webhook',
          title: '',
          kind: 'bug',
          canonicalType: 'incident',
          importance: 'high',
          tags: ['n8n'],
          reminderDate: '',
          reminderTime: '',
        },
        selectedProjectSlug: 'n8n-automations',
        selectedFolderId: '',
        suggestedFolderPath: ['Webhooks', 'Operacao'],
        pendingApproval: 'folder_create',
        confidence: 'high',
        action: 'confirm',
      };
    }
    return {
      replyText: 'Qual projeto devo usar?',
      resolvedDraft: {
        rawText: String(payload.messageText || '').trim(),
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
      confidence: 'low',
      action: 'ask',
    };
  }
}

class StubConversationExtractionGateway {
  async extract() {
    return {};
  }
}

function configureEnv() {
  process.env.KB_WEBHOOK_SECRET = 'webhook-secret';
  process.env.KB_WPP_WEBHOOK_API_KEY = 'provider-key';
  process.env.KB_REVIEW_AI_PROVIDER = 'none';
  process.env.KB_CONVERSATION_AI_PROVIDER = 'none';
}

async function fixture(t, sender = new CapturingWhatsappSender()) {
  configureEnv();
  const repositories = await createPostgresTestRepositories(t);
  const user = await repositories.createTestUser();
  await repositories.contentRepository.upsertWorkspace(user.id, {
    workspaceSlug: 'default',
    displayName: 'Default',
    whatsappGroupJid: '120363@g.us',
    telegramChatId: '',
    githubRepos: [],
    projectSlugs: ['inbox', 'n8n-automations'],
    createdAt: '2026-04-27T00:00:00.000Z',
    updatedAt: '2026-04-27T00:00:00.000Z',
  });
  await repositories.contentRepository.upsertProject(user.id, {
    projectSlug: 'n8n-automations',
    displayName: 'N8N Automations',
    repositories: [],
    workspaceSlug: 'default',
    aliases: ['n8n'],
    defaultTags: [],
    enabled: true,
  });
  await repositories.externalIdentityRepository.upsertExternalIdentity({
    userId: user.id,
    workspaceSlug: 'default',
    provider: 'whatsapp',
    identityType: 'jid',
    externalId: '120363@g.us',
    publicMetadata: {},
  });
  await repositories.credentialRepository.upsertCredential({
    userId: user.id,
    workspaceSlug: 'default',
    provider: 'ai-conversation',
    status: 'connected',
    encryptedConfig: {},
    publicMetadata: {},
  });
  const ingest = new IngestEntryUseCase(repositories.contentRepository);
  const conversation = new ProcessAgentConversationUseCase(
    repositories.contentRepository,
    repositories.conversationStateRepository,
    ingest,
    new CreateProjectFolderUseCase(repositories.contentRepository),
    { read: () => ({ reminderTimeZone: 'America/Sao_Paulo', conversationAiProvider: 'openrouter', conversationAiBaseUrl: 'https://example.com', conversationAiModel: 'test-model', conversationAiApiKey: 'test-key' }) },
    new StubConversationAgentGateway(),
    repositories.credentialRepository,
  );
  const legacyConversation = new ProcessConversationUseCase(
    repositories.contentRepository,
    repositories.contentQueryRepository,
    repositories.conversationStateRepository,
    ingest,
    { read: () => ({ reminderTimeZone: 'America/Sao_Paulo', conversationTimeoutMs: 600000 }) },
    new StubConversationExtractionGateway(),
    repositories.credentialRepository,
  );
  const whatsapp = new HandleWhatsappWebhookUseCase(
    repositories.externalIdentityRepository,
    repositories.webhookEventRepository,
    { read: () => ({ reminderTimeZone: 'America/Sao_Paulo', webhookSecret: process.env.KB_WEBHOOK_SECRET || '', whatsappWebhookApiKey: process.env.KB_WPP_WEBHOOK_API_KEY || '', evolutionApiKey: process.env.EVOLUTION_API_KEY || '' }) },
    undefined,
    conversation,
    legacyConversation,
    sender,
  );
  return { repositories, whatsapp, sender, user };
}

function evolutionInput(message, overrides = {}) {
  return {
    headers: { apikey: 'provider-key' },
    body: {
      event: 'MESSAGES_UPSERT',
      data: {
        key: {
          remoteJid: '120363@g.us',
          participant: '5511999999999@s.whatsapp.net',
          id: `msg-${Math.random()}`,
          fromMe: false,
        },
        message: { conversation: message },
      },
      ...overrides,
    },
  };
}

test('linked whatsapp group processes free text and sends the first conversation reply', async (t) => {
  const { whatsapp, sender } = await fixture(t);

  const result = await whatsapp.execute(evolutionInput('corrigi timeout no webhook'));

  assert.equal(result.ok, true);
  assert.equal(result.processed, true);
  assert.equal(result.action, 'confirm');
  assert.match(result.replyText, /Sugestao de pasta/);
  assert.equal(result.replySent, true);
  assert.match(result.conversationResult.replyText, /Sugestao de pasta/);
  assert.equal(result.message, result.replyText);
  assert.equal(result.text, result.replyText);
  assert.equal(result.reply, result.replyText);
  assert.equal(result.confirmText, result.replyText);
  assert.equal(sender.sent.length, 1);
  assert.equal(sender.sent[0].groupJid, '120363@g.us');
  assert.match(sender.sent[0].text, /Sugestao de pasta/);
});

test('linked whatsapp group completes conversation and saves note on confirmation', async (t) => {
  const { repositories, whatsapp, user } = await fixture(t);

  await whatsapp.execute(evolutionInput('corrigi timeout no webhook'));
  await whatsapp.execute(evolutionInput('sim'));
  const result = await whatsapp.execute(evolutionInput('sim'));

  assert.equal(result.action, 'submit');
  assert.equal(result.replyText, 'Nota salva com sucesso.');
  assert.equal(result.conversationResult.action, 'submit');
  const notes = await repositories.contentRepository.listNotes(user.id);
  assert.equal(notes.length, 1);
  assert.equal(notes[0].projectSlug, 'n8n-automations');
  assert.equal(notes[0].sourceChannel, 'whatsapp');
});

test('whatsapp knowledge command replies to query without creating capture state', async (t) => {
  const { repositories, whatsapp, user } = await fixture(t);
  await repositories.contentRepository.upsertNote(user.id, {
    path: '20 Inbox/n8n-automations/2026/04/deploy.md',
    type: 'event',
    title: 'Deploy checklist',
    projectSlug: 'n8n-automations',
    workspaceSlug: 'default',
    status: 'active',
    tags: ['deploy'],
    occurredAt: '2026-04-27',
    sourceChannel: 'test',
    summary: 'Revisar timeout e validar webhook em producao.',
    markdown: '',
    frontmatter: {},
    metadata: {},
    origin: 'postgres',
    source: 'test',
    links: [],
  });

  const result = await whatsapp.execute(evolutionInput('/buscar deploy webhook'));

  assert.equal(result.action, 'reply');
  assert.match(result.replyText, /deploy/i);
  assert.equal(result.conversationResult.action, 'reply');
  assert.match(result.conversationResult.replyText, /deploy/i);
  assert.equal(await repositories.countConversationStates(), 0);
});

test('whatsapp webhook ignores only bot-prefixed self messages', async (t) => {
  const { whatsapp, sender } = await fixture(t);

  const result = await whatsapp.execute(evolutionInput('[BOT] resposta do bot', {
    data: {
      key: { remoteJid: '120363@g.us', participant: '5511999999999@s.whatsapp.net', id: 'from-me', fromMe: true },
      message: { conversation: '[BOT] resposta do bot' },
    },
  }));

  assert.equal(result.processed, false);
  assert.equal(result.ignored, 'from_me');
  assert.equal(sender.sent.length, 0);
});

test('whatsapp webhook processes self-authored messages without bot prefix', async (t) => {
  const { whatsapp, sender } = await fixture(t);

  const result = await whatsapp.execute(evolutionInput('corrigi timeout no webhook', {
    data: {
      key: { remoteJid: '120363@g.us', participant: '5511999999999@s.whatsapp.net', id: 'from-me-user', fromMe: true },
      message: { conversation: 'corrigi timeout no webhook' },
    },
  }));

  assert.equal(result.ok, true);
  assert.equal(result.processed, true);
  assert.equal(result.replySent, true);
  assert.equal(sender.sent.length, 1);
  assert.match(sender.sent[0].text, /Sugestao de pasta/);
});

test('unknown whatsapp group is still rejected', async (t) => {
  const { whatsapp } = await fixture(t);

  await assert.rejects(
    () => whatsapp.execute(evolutionInput('mensagem normal', {
      data: {
        key: { remoteJid: 'unknown@g.us', participant: '5511999999999@s.whatsapp.net', id: 'unknown', fromMe: false },
        message: { conversation: 'mensagem normal' },
      },
    })),
    /identity_not_found/,
  );
});

test('evolution send failure returns replySent false after confirmation without duplicating note', async (t) => {
  const sender = new CapturingWhatsappSender(false);
  const { repositories, whatsapp, user } = await fixture(t, sender);

  await whatsapp.execute(evolutionInput('corrigi timeout no webhook'));
  await whatsapp.execute(evolutionInput('sim'));
  const result = await whatsapp.execute(evolutionInput('sim'));

  assert.equal(result.conversationResult.action, 'submit');
  assert.equal(result.replySent, false);
  assert.equal(result.replyError, 'send_failed');
  assert.equal((await repositories.contentRepository.listNotes(user.id)).length, 1);
});

test('whatsapp media without caption asks for text and does not save attachment', async (t) => {
  const { repositories, whatsapp, sender, user } = await fixture(t);

  const result = await whatsapp.execute(evolutionInput('', {
    data: {
      key: { remoteJid: '120363@g.us', participant: '5511999999999@s.whatsapp.net', id: 'media', fromMe: false },
      message: { imageMessage: { mimetype: 'image/png' } },
    },
  }));

  assert.equal(result.replySent, true);
  assert.match(result.replyText, /legenda ou texto/);
  assert.equal((await repositories.contentRepository.listNotes(user.id)).length, 0);
  assert.equal(sender.sent.length, 1);
});
