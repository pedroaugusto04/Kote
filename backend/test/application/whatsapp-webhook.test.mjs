import test from 'node:test';
import assert from 'node:assert/strict';

import { HandleWhatsappWebhookUseCase, IngestEntryUseCase, ProcessConversationUseCase } from '../../dist/application/use-cases/index.js';
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
  const ingest = new IngestEntryUseCase(repositories.contentRepository);
  const conversation = new ProcessConversationUseCase(
    repositories.contentRepository,
    repositories.contentQueryRepository,
    repositories.conversationStateRepository,
    ingest,
  );
  const whatsapp = new HandleWhatsappWebhookUseCase(
    repositories.externalIdentityRepository,
    repositories.webhookEventRepository,
    { read: () => ({ webhookSecret: process.env.KB_WEBHOOK_SECRET || '', whatsappWebhookApiKey: process.env.KB_WPP_WEBHOOK_API_KEY || '', evolutionApiKey: process.env.EVOLUTION_API_KEY || '' }) },
    undefined,
    conversation,
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
  assert.equal(result.action, 'reply');
  assert.match(result.replyText, /Qual o tipo da nota/);
  assert.equal(result.replySent, true);
  assert.match(result.conversationResult.replyText, /Qual o tipo da nota/);
  assert.equal(sender.sent.length, 1);
  assert.equal(sender.sent[0].groupJid, '120363@g.us');
  assert.match(sender.sent[0].text, /Qual o tipo da nota/);
});

test('linked whatsapp group completes conversation and saves note on confirmation', async (t) => {
  const { repositories, whatsapp, user } = await fixture(t);

  await whatsapp.execute(evolutionInput('corrigi timeout no webhook'));
  await whatsapp.execute(evolutionInput('2'));
  await whatsapp.execute(evolutionInput('n8n'));
  await whatsapp.execute(evolutionInput('9'));
  const result = await whatsapp.execute(evolutionInput('sim'));

  assert.equal(result.action, 'submit');
  assert.equal(result.replyText, 'Nota ingerida.');
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
  assert.match(sender.sent[0].text, /Qual o tipo da nota/);
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
  await whatsapp.execute(evolutionInput('2'));
  await whatsapp.execute(evolutionInput('n8n'));
  await whatsapp.execute(evolutionInput('9'));
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
