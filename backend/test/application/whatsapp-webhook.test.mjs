import test from 'node:test';
import assert from 'node:assert/strict';

import {
  CreateProjectFolderUseCase,
  HandleWhatsappWebhookUseCase,
  IngestEntryUseCase,
  ProcessAgentConversationUseCase,
  QueryKnowledgeUseCase,
} from '../../dist/application/use-cases/index.js';
import { ConversationAgentPresenter } from '../../dist/application/use-cases/conversation/services/conversation-agent.presenter.js';
import { ConversationFolderResolutionService } from '../../dist/application/use-cases/conversation/services/conversation-folder-resolution.service.js';
import { WhatsappConversationTaskQueue } from '../../dist/application/use-cases/webhooks/whatsapp/whatsapp-webhook-flow-control.js';
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

class StubWhatsappMediaDownloader {
  constructor(dataBase64 = Buffer.from('hello image').toString('base64')) {
    this.dataBase64 = dataBase64;
    this.calls = [];
  }

  async downloadBase64(input) {
    this.calls.push(input);
    return { ok: true, dataBase64: this.dataBase64 };
  }
}

class StubConversationAgentGateway {
  async decide(_config, payload) {
    const message = String(payload.messageText || '').trim().toLowerCase();
    if (message === 'corrigi timeout no webhook') {
      return {
        replyText: 'Ready to save.',
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
      confidence: 'low',
      action: 'ask',
    };
  }
}

function configureEnv() {
  process.env.KB_WEBHOOK_SECRET = 'webhook-secret';
  process.env.KB_WPP_WEBHOOK_API_KEY = 'provider-key';
  process.env.KB_REVIEW_AI_PROVIDER = 'none';
  process.env.KB_CONVERSATION_AI_PROVIDER = 'none';
}

async function fixture(t, sender = new CapturingWhatsappSender(), mediaDownloader, options = {}) {
  configureEnv();
  const repositories = await createPostgresTestRepositories(t);
  const user = await repositories.createTestUser();
  const whatsappJid = options.whatsappJid || '120363@g.us';
  await repositories.contentRepository.upsertWorkspace(user.id, {
    workspaceSlug: 'default',
    displayName: 'Default',
    whatsappChatJid: whatsappJid,
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
    defaultTags: [],
    enabled: true,
  });
  await repositories.externalIdentityRepository.upsertExternalIdentity({
    userId: user.id,
    workspaceSlug: 'default',
    provider: 'whatsapp',
    identityType: 'jid',
    externalId: whatsappJid,
    publicMetadata: {},
  });
  await repositories.credentialRepository.upsertCredential({
    userId: user.id,
    workspaceSlug: 'default',
    provider: 'whatsapp',
    status: 'connected',
    encryptedConfig: {},
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
  const ingest = new IngestEntryUseCase(repositories.contentRepository, repositories.runtimeEnvironmentProvider);
  const createFolder = new CreateProjectFolderUseCase(repositories.contentRepository);
  const presenter = new ConversationAgentPresenter();
  const folderResolution = new ConversationFolderResolutionService(repositories.contentRepository, createFolder);
  const conversation = new ProcessAgentConversationUseCase(
    repositories.contentRepository,
    repositories.conversationStateRepository,
    ingest,
    { read: () => ({ reminderTimeZone: 'America/Sao_Paulo', conversationAiProvider: 'openrouter', conversationAiBaseUrl: 'https://example.com', conversationAiModel: 'test-model', conversationAiApiKey: 'test-key' }) },
    new StubConversationAgentGateway(),
    presenter,
    folderResolution,
    repositories.credentialRepository,
  );
  const queryKnowledge = new QueryKnowledgeUseCase(
    repositories.contentQueryRepository,
  );
  const whatsapp = new HandleWhatsappWebhookUseCase(
    repositories.externalIdentityRepository,
    repositories.credentialRepository,
    repositories.webhookEventRepository,
    { read: () => ({ reminderTimeZone: 'America/Sao_Paulo', webhookSecret: process.env.KB_WEBHOOK_SECRET || '', whatsappWebhookApiKey: process.env.KB_WPP_WEBHOOK_API_KEY || '', evolutionApiKey: process.env.EVOLUTION_API_KEY || '' }) },
    undefined,
    conversation,
    queryKnowledge,
    sender,
    mediaDownloader,
  );
  return { repositories, whatsapp, sender, user, mediaDownloader };
}

function evolutionInput(message, overrides = {}, remoteJid = '120363@g.us') {
  return {
    headers: { apikey: 'provider-key' },
    body: {
      event: 'MESSAGES_UPSERT',
      data: {
        key: {
          remoteJid,
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

async function linkWhatsappWorkspace(repositories, userId, workspaceSlug, whatsappJid) {
  await repositories.contentRepository.upsertWorkspace(userId, {
    workspaceSlug,
    displayName: workspaceSlug === 'default' ? 'Default' : workspaceSlug,
    whatsappChatJid: whatsappJid,
    telegramChatId: '',
    githubRepos: [],
    projectSlugs: ['inbox', 'n8n-automations'],
    createdAt: '2026-04-27T00:00:00.000Z',
    updatedAt: '2026-04-27T00:00:00.000Z',
  });
  await repositories.contentRepository.upsertProject(userId, {
    projectSlug: 'n8n-automations',
    displayName: 'N8N Automations',
    repositories: [],
    workspaceSlug,
    defaultTags: [],
    enabled: true,
  });
  await repositories.externalIdentityRepository.upsertExternalIdentity({
    userId,
    workspaceSlug,
    provider: 'whatsapp',
    identityType: 'jid',
    externalId: whatsappJid,
    publicMetadata: {},
  });
  await repositories.credentialRepository.upsertCredential({
    userId,
    workspaceSlug,
    provider: 'whatsapp',
    status: 'connected',
    encryptedConfig: {},
    publicMetadata: {},
  });
  await repositories.credentialRepository.upsertCredential({
    userId,
    workspaceSlug,
    provider: 'ai-conversation',
    status: 'connected',
    encryptedConfig: {},
    publicMetadata: {},
  });
}

test('linked whatsapp chat processes free text and sends the first conversation reply', async (t) => {
  const { whatsapp, sender } = await fixture(t);

  const result = await whatsapp.execute(evolutionInput('/kb corrigi timeout no webhook'));

  assert.equal(result.ok, true);
  assert.equal(result.processed, true);
  assert.equal(result.action, 'submit');
  assert.match(result.message, /^Note saved successfully:/);
  assert.match(result.message, /Type: Incident/);
  assert.match(result.message, /Project: N8N Automations/);
  assert.match(result.message, /Folder: Webhooks \/ Operacao/);
  assert.equal(result.replySent, true);
  assert.equal(result.conversationResult.replyText, result.message);
  assert.equal(result.replyText, undefined);
  assert.equal(result.text, undefined);
  assert.equal(result.reply, undefined);
  assert.equal(result.confirmText, undefined);
  assert.equal(sender.sent.length, 1);
  assert.equal(sender.sent[0].chatJid, '120363@g.us');
  assert.equal(sender.sent[0].text, result.message);
});

test('linked whatsapp private chat processes free text and replies to the private jid', async (t) => {
  const privateJid = '5511999999999@s.whatsapp.net';
  const { whatsapp, sender } = await fixture(t, new CapturingWhatsappSender(), undefined, { whatsappJid: privateJid });

  const result = await whatsapp.execute(evolutionInput('corrigi timeout no webhook', {
    data: {
      key: { remoteJid: privateJid, id: 'private-message', fromMe: false },
      message: { conversation: 'corrigi timeout no webhook' },
    },
  }));

  assert.equal(result.ok, true);
  assert.equal(result.processed, true);
  assert.equal(result.replySent, true);
  assert.equal(sender.sent.length, 1);
  assert.equal(sender.sent[0].chatJid, privateJid);
  assert.match(sender.sent[0].text, /^Note saved successfully:/);
  assert.match(sender.sent[0].text, /Project: N8N Automations/);
});

test('linked whatsapp private chats keep users and workspaces isolated', async (t) => {
  const privateJidA = '551100000001@s.whatsapp.net';
  const privateJidB = '551100000002@s.whatsapp.net';
  const { repositories, whatsapp, sender, user } = await fixture(t, new CapturingWhatsappSender(), undefined, { whatsappJid: privateJidA });
  const otherUser = await repositories.createTestUser({ email: 'other-private@example.com', displayName: 'Other User' });
  await linkWhatsappWorkspace(repositories, otherUser.id, 'default', privateJidB);

  await whatsapp.execute(evolutionInput('corrigi timeout no webhook', {
    data: {
      key: { remoteJid: privateJidA, id: 'private-a-draft', fromMe: false },
      message: { conversation: 'corrigi timeout no webhook' },
    },
  }));
  await whatsapp.execute(evolutionInput('corrigi timeout no webhook', {
    data: {
      key: { remoteJid: privateJidB, id: 'private-b-draft', fromMe: false },
      message: { conversation: 'corrigi timeout no webhook' },
    },
  }));
  const ownerNotes = await repositories.contentRepository.listNotes(user.id);
  const otherNotes = await repositories.contentRepository.listNotes(otherUser.id);
  assert.equal(ownerNotes.length, 1);
  assert.equal(ownerNotes[0].workspaceSlug, 'default');
  assert.equal(otherNotes.length, 1);
  assert.equal(otherNotes[0].workspaceSlug, 'default');
  assert.deepEqual(sender.sent.map((item) => item.chatJid), [privateJidA, privateJidB]);
});

test('linked whatsapp chat saves note without explicit confirmation', async (t) => {
  const { repositories, whatsapp, user } = await fixture(t);

  const result = await whatsapp.execute(evolutionInput('/kb corrigi timeout no webhook'));

  assert.equal(result.action, 'submit');
  assert.match(result.message, /^Note saved successfully:/);
  assert.equal(result.conversationResult.action, 'submit');
  const notes = await repositories.contentRepository.listNotes(user.id);
  assert.equal(notes.length, 1);
  assert.equal(notes[0].projectSlug, 'n8n-automations');
  assert.equal(notes[0].sourceChannel, 'whatsapp');
});

test('revoked whatsapp integration ignores linked chat messages before invoking the agent', async (t) => {
  const { repositories, whatsapp, sender, user } = await fixture(t);
  await repositories.credentialRepository.revokeCredential(user.id, 'default', 'whatsapp', { revoked: true });

  const result = await whatsapp.execute(evolutionInput('/kb corrigi timeout no webhook'));

  assert.equal(result.ok, true);
  assert.equal(result.processed, false);
  assert.equal(result.ignored, 'whatsapp_integration_inactive');
  assert.equal(sender.sent.length, 0);
  assert.equal((await repositories.contentRepository.listNotes(user.id)).length, 0);
  assert.equal(await repositories.countConversationStates(), 0);
});

test('whatsapp webhook is idempotent for duplicate message deliveries', async (t) => {
  const { whatsapp, sender } = await fixture(t);
  const input = evolutionInput('/kb corrigi timeout no webhook', {
    data: {
      key: {
        remoteJid: '120363@g.us',
        participant: '5511999999999@s.whatsapp.net',
        id: 'duplicate-message-id',
        fromMe: false,
      },
      message: { conversation: '/kb corrigi timeout no webhook' },
    },
  });

  const first = await whatsapp.execute(input);
  const second = await whatsapp.execute(input);

  assert.equal(first.processed, true);
  assert.equal(first.replySent, true);
  assert.equal(second.processed, false);
  assert.equal(second.ignored, 'duplicate_message');
  assert.equal(sender.sent.length, 1);
});

test('whatsapp webhook rate limits chatty senders with a clear throttled notice', async (t) => {
  const { whatsapp, sender } = await fixture(t);
  const results = [];
  for (let index = 0; index < 7; index += 1) {
    results.push(await whatsapp.execute(evolutionInput(`/kb mensagem ${index}`, {
      data: {
        key: {
          remoteJid: '120363@g.us',
          participant: '5511999999999@s.whatsapp.net',
          id: `rate-limit-${index}`,
          fromMe: false,
        },
        message: { conversation: `/kb mensagem ${index}` },
      },
    })));
  }

  const limited = results.at(-1);
  assert.equal(limited.processed, false);
  assert.equal(limited.ignored, 'rate_limited');
  assert.match(limited.message, /Wait \d+s and send it again/);
  assert.equal(limited.replySent, true);
  assert.match(sender.sent.at(-1).text, /I received too many messages in a short time/);
});

test('whatsapp conversation task queue serializes work for the same conversation key', async () => {
  const queue = new WhatsappConversationTaskQueue();
  const events = [];
  let releaseFirst;
  const firstRelease = new Promise((resolve) => {
    releaseFirst = resolve;
  });

  const first = queue.enqueue('conversation-1', async () => {
    events.push('first:start');
    await firstRelease;
    events.push('first:end');
    return 'first';
  });
  const second = queue.enqueue('conversation-1', async () => {
    events.push('second:start');
    return 'second';
  });

  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(events, ['first:start']);
  releaseFirst();
  assert.equal(await first, 'first');
  assert.equal(await second, 'second');
  assert.deepEqual(events, ['first:start', 'first:end', 'second:start']);
});

test('linked whatsapp chat saves captioned media as a Supabase-backed attachment immediately', async (t) => {
  const { repositories, whatsapp, user } = await fixture(t);

  const result = await whatsapp.execute(evolutionInput('', {
    data: {
      key: { remoteJid: '120363@g.us', participant: '5511999999999@s.whatsapp.net', id: 'media-caption', fromMe: false },
      message: {
        imageMessage: {
          caption: '/kb corrigi timeout no webhook',
          mimetype: 'image/png',
          fileLength: 11,
          fileName: 'erro.png',
        },
      },
      dataBase64: Buffer.from('hello image').toString('base64'),
    },
  }));

  assert.equal(result.action, 'submit');
  assert.equal(result.ingestResult.attachmentIds.length, 1);
  const attachments = await repositories.contentRepository.listAttachments(user.id, result.ingestResult.noteId);
  assert.equal(attachments.length, 1);
  assert.equal(attachments[0].fileName, 'erro.png');
  assert.equal(attachments[0].mimeType, 'image/png');
  assert.equal(attachments[0].sizeBytes, 11);
  assert.match(attachments[0].storageKey, new RegExp(`^users/${user.id}/workspaces/default/attachments/${result.ingestResult.noteId}/erro\\.png$`));
  assert.equal((await repositories.objectStorage.get(attachments[0].storageKey)).toString('utf8'), 'hello image');
});

test('linked whatsapp chat normalizes attachment storage keys for accented filenames', async (t) => {
  const { repositories, whatsapp, user } = await fixture(t);

  const result = await whatsapp.execute(evolutionInput('', {
    data: {
      key: { remoteJid: '120363@g.us', participant: '5511999999999@s.whatsapp.net', id: 'media-accented-name', fromMe: false },
      message: {
        documentMessage: {
          caption: '/kb corrigi timeout no webhook',
          mimetype: 'application/pdf',
          fileLength: 11,
          fileName: 'FéConect-52e25237-dd8a-4511-ba6b-1e394674930f (11).pdf',
        },
      },
      dataBase64: Buffer.from('hello pdf').toString('base64'),
    },
  }));

  assert.equal(result.action, 'submit');
  assert.equal(result.ingestResult.attachmentIds.length, 1);
  const attachments = await repositories.contentRepository.listAttachments(user.id, result.ingestResult.noteId);
  assert.equal(attachments.length, 1);
  assert.equal(attachments[0].fileName, 'FéConect-52e25237-dd8a-4511-ba6b-1e394674930f (11).pdf');
  assert.equal(attachments[0].mimeType, 'application/pdf');
  assert.match(
    attachments[0].storageKey,
    new RegExp(`^users/${user.id}/workspaces/default/attachments/${result.ingestResult.noteId}/feconect-52e25237-dd8a-4511-ba6b-1e394674930f-11\\.pdf$`),
  );
  assert.equal((await repositories.objectStorage.get(attachments[0].storageKey)).toString('utf8'), 'hello pdf');
});

test('direct whatsapp webhook downloads media when Evolution payload has metadata without base64', async (t) => {
  const downloader = new StubWhatsappMediaDownloader(Buffer.from('downloaded image').toString('base64'));
  const { repositories, whatsapp, user } = await fixture(t, new CapturingWhatsappSender(), downloader);

  const result = await whatsapp.execute(evolutionInput('', {
    data: {
      key: { remoteJid: '120363@g.us', participant: '5511999999999@s.whatsapp.net', id: 'media-download', fromMe: false },
      message: {
        imageMessage: {
          caption: '/kb corrigi timeout no webhook',
          mimetype: 'image/png',
          fileLength: 16,
          fileName: 'erro.png',
        },
      },
    },
  }));

  assert.equal(downloader.calls.length, 1);
  assert.equal(result.action, 'submit');
  assert.equal(result.ingestResult.attachmentIds.length, 1);
  const attachments = await repositories.contentRepository.listAttachments(user.id, result.ingestResult.noteId);
  assert.equal(attachments.length, 1);
  assert.equal((await repositories.objectStorage.get(attachments[0].storageKey)).toString('utf8'), 'downloaded image');
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

  const result = await whatsapp.execute(evolutionInput('/kb /buscar deploy webhook'));

  assert.equal(result.action, 'reply');
  assert.match(result.message, /deploy/i);
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

  const result = await whatsapp.execute(evolutionInput('/kb corrigi timeout no webhook', {
    data: {
      key: { remoteJid: '120363@g.us', participant: '5511999999999@s.whatsapp.net', id: 'from-me-user', fromMe: true },
      message: { conversation: '/kb corrigi timeout no webhook' },
    },
  }));

  assert.equal(result.ok, true);
  assert.equal(result.processed, true);
  assert.equal(result.replySent, true);
  assert.equal(sender.sent.length, 1);
  assert.match(sender.sent[0].text, /^Note saved successfully:/);
});

test('unknown whatsapp chat is still rejected', async (t) => {
  const { whatsapp } = await fixture(t);

  await assert.rejects(
    () => whatsapp.execute(evolutionInput('/kb mensagem normal', {
      data: {
        key: { remoteJid: 'unknown@g.us', participant: '5511999999999@s.whatsapp.net', id: 'unknown', fromMe: false },
        message: { conversation: '/kb mensagem normal' },
      },
    })),
    /identity_not_found/,
  );
});

test('evolution send failure returns replySent false after saving without duplicating note', async (t) => {
  const sender = new CapturingWhatsappSender(false);
  const { repositories, whatsapp, user } = await fixture(t, sender);

  const result = await whatsapp.execute(evolutionInput('/kb corrigi timeout no webhook'));

  assert.equal(result.conversationResult.action, 'submit');
  assert.equal(result.replySent, false);
  assert.equal(result.replyError, 'send_failed');
  assert.equal((await repositories.contentRepository.listNotes(user.id)).length, 1);
});

test('whatsapp private media without caption asks for text and does not save attachment', async (t) => {
  const privateJid = '5511999999999@s.whatsapp.net';
  const { repositories, whatsapp, sender, user } = await fixture(t, new CapturingWhatsappSender(), undefined, { whatsappJid: privateJid });

  const result = await whatsapp.execute(evolutionInput('', {
    data: {
      key: { remoteJid: privateJid, id: 'media', fromMe: false },
      message: { imageMessage: { mimetype: 'image/png' } },
    },
  }, privateJid));

  assert.equal(result.replySent, true);
  assert.match(result.message, /Send the context so I can organize and save it/);
  assert.equal((await repositories.contentRepository.listNotes(user.id)).length, 0);
  assert.equal(await repositories.countConversationStates(), 1);
  assert.equal(sender.sent.length, 1);
});

test('group messages without /kb prefix are ignored before creating notes or replies', async (t) => {
  const { repositories, whatsapp, sender, user } = await fixture(t);

  const result = await whatsapp.execute(evolutionInput('corrigi timeout no webhook'));

  assert.equal(result.ok, true);
  assert.equal(result.processed, false);
  assert.equal(result.ignored, 'missing_group_prefix');
  assert.equal(sender.sent.length, 0);
  assert.equal((await repositories.contentRepository.listNotes(user.id)).length, 0);
  assert.equal(await repositories.countConversationStates(), 0);
});
