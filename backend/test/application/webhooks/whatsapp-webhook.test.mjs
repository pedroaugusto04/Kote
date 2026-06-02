import test from 'node:test';
import assert from 'node:assert/strict';

import {
  CreateProjectFolderUseCase,
  HandleWhatsappWebhookUseCase,
  IngestEntryUseCase,
  ProcessAgentConversationUseCase,
  ResolveWhatsappAskAttachmentsUseCase,
} from '../../../dist/application/use-cases/index.js';
import { ConversationAgentPresenter } from '../../../dist/application/use-cases/conversation/services/conversation-agent.presenter.js';
import { ConversationFolderResolutionService } from '../../../dist/application/use-cases/conversation/services/conversation-folder-resolution.service.js';
import { WhatsappConversationTaskQueue } from '../../../dist/application/use-cases/webhooks/whatsapp/whatsapp-webhook-flow-control.js';
import { createPostgresTestRepositories } from '../../helpers/postgres-test-repositories.mjs';

class CapturingWhatsappSender {
  constructor(ok = true) {
    this.ok = ok;
    this.sent = [];
    this.media = [];
  }

  async sendText(input) {
    this.sent.push(input);
    return this.ok ? { ok: true } : { ok: false, error: 'send_failed' };
  }

  async sendMedia(input) {
    this.media.push(input);
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

class StubAskKnowledgeUseCase {
  constructor(result = {}) {
    this.calls = [];
    this.result = {
      ok: true,
      answer: 'Deploy using the staging checklist first.',
      confidence: 'high',
      requestedAttachments: false,
      sources: [{ noteId: 'note-1', title: 'Deploy checklist', path: '20 Inbox/deploy.md' }],
      relatedNotes: [],
      ...result,
    };
  }

  async execute(question, userId, options) {
    this.calls.push({ question, userId, options });
    return this.result;
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
  const whatsapp = new HandleWhatsappWebhookUseCase(
    repositories.externalIdentityRepository,
    repositories.credentialRepository,
    repositories.webhookEventRepository,
    { read: () => ({ reminderTimeZone: 'America/Sao_Paulo', webhookSecret: process.env.KB_WEBHOOK_SECRET || '', whatsappWebhookApiKey: process.env.KB_WPP_WEBHOOK_API_KEY || '', evolutionApiKey: process.env.EVOLUTION_API_KEY || '', audioAiProvider: options.audioTranscription ? 'gemini' : 'none', audioAiBaseUrl: 'https://generativelanguage.googleapis.com/v1beta', audioAiModel: 'gemini-2.5-flash', audioAiApiKey: 'dummy-key' }) },
    undefined,
    conversation,
    options.askKnowledge,
    sender,
    mediaDownloader,
    undefined,
    options.askAttachments === false ? undefined : new ResolveWhatsappAskAttachmentsUseCase(repositories.contentRepository, repositories.objectStorage),
    options.audioTranscription,
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

async function seedAskNoteWithAttachment(repositories, userId, input = {}) {
  const note = await repositories.contentRepository.upsertNote(userId, {
    path: input.path || `20 Inbox/n8n-automations/2026/04/${input.title || 'deploy'}.md`,
    type: 'event',
    title: input.title || 'Deploy checklist',
    projectSlug: 'n8n-automations',
    workspaceSlug: input.workspaceSlug || 'default',
    folderId: null,
    status: 'active',
    tags: ['deploy'],
    occurredAt: '2026-04-27T10:00:00.000Z',
    sourceChannel: 'external',
    summary: 'Deploy checklist',
    markdown: '# Deploy checklist\n',
    frontmatter: {},
    metadata: {},
    origin: 'postgres',
    source: 'manual-api',
    links: [],
  });
  const fileName = input.fileName || 'checklist.pdf';
  const body = input.body || 'hello pdf';
  const sizeBytes = input.sizeBytes ?? Buffer.byteLength(body);
  const attachment = await repositories.contentRepository.saveAttachment(userId, {
    noteId: note.id,
    fileName,
    mimeType: input.mimeType || 'application/pdf',
    sizeBytes,
    dataBase64: Buffer.from(body).toString('base64'),
    checksumSha256: input.checksumSha256 || `${fileName}-checksum`,
    metadata: {},
  });
  return { note, attachment };
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

test('whatsapp /ask command replies with semantic AI answer scoped to the workspace', async (t) => {
  const askKnowledge = new StubAskKnowledgeUseCase();
  const { whatsapp, sender, user } = await fixture(t, new CapturingWhatsappSender(), undefined, { askKnowledge });

  const result = await whatsapp.execute(evolutionInput('/kb /ask como fazer deploy?'));

  assert.equal(result.action, 'ask');
  assert.equal(result.replySent, true);
  assert.match(result.message, /Deploy using the staging checklist first/);
  assert.doesNotMatch(result.message, /Confidence:/);
  assert.doesNotMatch(result.message, /Source:/);
  assert.equal(result.askResult, askKnowledge.result);
  assert.deepEqual(askKnowledge.calls, [
    {
      question: 'como fazer deploy?',
      userId: user.id,
      options: { workspaceSlug: 'default' },
    },
  ]);
  assert.equal(sender.sent.length, 1);
  assert.equal(sender.sent[0].chatJid, '120363@g.us');
  assert.equal(sender.sent[0].text, result.message);
  assert.equal(sender.media.length, 0);
});

test('whatsapp /ask command sends related note attachments only when requested', async (t) => {
  const askKnowledge = new StubAskKnowledgeUseCase();
  const { repositories, whatsapp, sender, user } = await fixture(t, new CapturingWhatsappSender(), undefined, { askKnowledge });
  const { note, attachment } = await seedAskNoteWithAttachment(repositories, user.id, {
    fileName: 'deploy.pdf',
    mimeType: 'application/pdf',
    body: 'deploy pdf',
  });
  askKnowledge.result.sources = [{ noteId: note.id, title: note.title, path: note.path }];
  askKnowledge.result.relatedNotes = [{ id: note.id, title: note.title, path: note.path, workspaceSlug: note.workspaceSlug }];
  askKnowledge.result.requestedAttachments = true;

  const result = await whatsapp.execute(evolutionInput('/kb /ask quero o PDF do deploy'));

  assert.equal(result.action, 'ask');
  assert.equal(result.replySent, true);
  assert.equal(result.mediaSent, 1);
  assert.equal(result.mediaFailed, 0);
  assert.equal(sender.sent.length, 1);
  assert.equal(sender.media.length, 1);
  assert.deepEqual(sender.media[0], {
    chatJid: '120363@g.us',
    mediaType: 'document',
    mimeType: 'application/pdf',
    fileName: 'deploy.pdf',
    mediaBase64: Buffer.from('deploy pdf').toString('base64'),
  });
  assert.equal(sender.media[0].fileName, attachment.fileName);
});

test('whatsapp /ask command limits media replies to 3 attachments', async (t) => {
  const askKnowledge = new StubAskKnowledgeUseCase();
  const { repositories, whatsapp, sender, user } = await fixture(t, new CapturingWhatsappSender(), undefined, { askKnowledge });
  const seeded = [];
  for (let index = 0; index < 4; index += 1) {
    seeded.push(await seedAskNoteWithAttachment(repositories, user.id, {
      title: `Deploy ${index}`,
      fileName: `deploy-${index}.pdf`,
      body: `pdf-${index}`,
    }));
  }
  askKnowledge.result.sources = seeded.map(({ note }) => ({ noteId: note.id, title: note.title, path: note.path }));
  askKnowledge.result.relatedNotes = seeded.map(({ note }) => ({ id: note.id, workspaceSlug: note.workspaceSlug }));
  askKnowledge.result.requestedAttachments = true;

  const result = await whatsapp.execute(evolutionInput('/kb /ask quero os anexos do deploy'));

  assert.equal(result.mediaSent, 3);
  assert.equal(sender.media.length, 3);
  assert.deepEqual(sender.media.map((item) => item.fileName), ['deploy-0.pdf', 'deploy-1.pdf', 'deploy-2.pdf']);
});

test('whatsapp /ask command filters attachments by requestedAttachmentPattern when matched', async (t) => {
  const askKnowledge = new StubAskKnowledgeUseCase();
  const { repositories, whatsapp, sender, user } = await fixture(t, new CapturingWhatsappSender(), undefined, { askKnowledge });
  const seeded = [];
  seeded.push(await seedAskNoteWithAttachment(repositories, user.id, {
    title: 'Deploy checklist',
    fileName: 'resumo-ciencia-dados.pdf',
    body: 'resumo pdf',
  }));
  seeded.push(await seedAskNoteWithAttachment(repositories, user.id, {
    title: 'Deploy checklist extra',
    fileName: 'outro-doc.pdf',
    body: 'outro pdf',
  }));

  askKnowledge.result.sources = seeded.map(({ note }) => ({ noteId: note.id, title: note.title, path: note.path }));
  askKnowledge.result.relatedNotes = seeded.map(({ note }) => ({ id: note.id, workspaceSlug: note.workspaceSlug }));
  askKnowledge.result.requestedAttachments = true;
  askKnowledge.result.requestedAttachmentPattern = 'resumo';

  const result = await whatsapp.execute(evolutionInput('/kb /ask quero o PDF de resumo'));

  assert.equal(result.mediaSent, 1);
  assert.equal(sender.media.length, 1);
  assert.equal(sender.media[0].fileName, 'resumo-ciencia-dados.pdf');
});

test('whatsapp /ask command falls back to all attachments when requestedAttachmentPattern matches nothing', async (t) => {
  const askKnowledge = new StubAskKnowledgeUseCase();
  const { repositories, whatsapp, sender, user } = await fixture(t, new CapturingWhatsappSender(), undefined, { askKnowledge });
  const seeded = [];
  seeded.push(await seedAskNoteWithAttachment(repositories, user.id, {
    title: 'Deploy checklist',
    fileName: 'outro-doc.pdf',
    body: 'outro pdf',
  }));

  askKnowledge.result.sources = seeded.map(({ note }) => ({ noteId: note.id, title: note.title, path: note.path }));
  askKnowledge.result.relatedNotes = seeded.map(({ note }) => ({ id: note.id, workspaceSlug: note.workspaceSlug }));
  askKnowledge.result.requestedAttachments = true;
  askKnowledge.result.requestedAttachmentPattern = 'nao-existente';

  const result = await whatsapp.execute(evolutionInput('/kb /ask quero o PDF de nao-existente'));

  assert.equal(result.mediaSent, 1);
  assert.equal(sender.media.length, 1);
  assert.equal(sender.media[0].fileName, 'outro-doc.pdf');
});

test('whatsapp /ask command skips attachments over 15 MB and mentions the size limit', async (t) => {
  const askKnowledge = new StubAskKnowledgeUseCase();
  const { repositories, whatsapp, sender, user } = await fixture(t, new CapturingWhatsappSender(), undefined, { askKnowledge });
  const { note } = await seedAskNoteWithAttachment(repositories, user.id, {
    fileName: 'large.pdf',
    sizeBytes: 15 * 1024 * 1024 + 1,
    body: 'large placeholder',
  });
  askKnowledge.result.sources = [{ noteId: note.id, title: note.title, path: note.path }];
  askKnowledge.result.relatedNotes = [{ id: note.id, workspaceSlug: note.workspaceSlug }];
  askKnowledge.result.requestedAttachments = true;

  const result = await whatsapp.execute(evolutionInput('/kb /ask quero o arquivo do deploy'));

  assert.equal(result.mediaSent, 0);
  assert.equal(result.mediaOversized, 1);
  assert.equal(sender.media.length, 0);
  assert.match(result.message, /larger than 15 MB/);
});

test('whatsapp /ask command reports no attachments when related notes have none', async (t) => {
  const askKnowledge = new StubAskKnowledgeUseCase();
  const { repositories, whatsapp, sender, user } = await fixture(t, new CapturingWhatsappSender(), undefined, { askKnowledge });
  const { note } = await seedAskNoteWithAttachment(repositories, user.id, {
    fileName: 'temporary.pdf',
  });
  await repositories.contentRepository.deleteNote(user.id, note.id);
  const emptyNote = await repositories.contentRepository.upsertNote(user.id, {
    path: '20 Inbox/n8n-automations/2026/04/empty.md',
    type: 'event',
    title: 'Empty deploy note',
    projectSlug: 'n8n-automations',
    workspaceSlug: 'default',
    folderId: null,
    status: 'active',
    tags: [],
    occurredAt: '2026-04-27T10:00:00.000Z',
    sourceChannel: 'external',
    summary: 'No attachment here',
    markdown: '# Empty\n',
    frontmatter: {},
    metadata: {},
    origin: 'postgres',
    source: 'manual-api',
    links: [],
  });
  askKnowledge.result.sources = [{ noteId: emptyNote.id, title: emptyNote.title, path: emptyNote.path }];
  askKnowledge.result.relatedNotes = [{ id: emptyNote.id, workspaceSlug: emptyNote.workspaceSlug }];
  askKnowledge.result.requestedAttachments = true;

  const result = await whatsapp.execute(evolutionInput('/kb /ask quero o arquivo do deploy'));

  assert.equal(result.mediaSent, 0);
  assert.equal(sender.media.length, 0);
  assert.match(result.message, /I could not find any attached files/);
});

test('whatsapp /ask attachments stay scoped to the linked workspace', async (t) => {
  const askKnowledge = new StubAskKnowledgeUseCase();
  const { repositories, whatsapp, sender, user } = await fixture(t, new CapturingWhatsappSender(), undefined, { askKnowledge });
  await repositories.contentRepository.upsertWorkspace(user.id, {
    workspaceSlug: 'other',
    displayName: 'Other',
    whatsappChatJid: '',
    telegramChatId: '',
    githubRepos: [],
    projectSlugs: ['n8n-automations'],
    createdAt: '2026-04-27T00:00:00.000Z',
    updatedAt: '2026-04-27T00:00:00.000Z',
  });
  const { note } = await seedAskNoteWithAttachment(repositories, user.id, {
    workspaceSlug: 'other',
    path: '20 Inbox/n8n-automations/other.md',
    fileName: 'other-workspace.pdf',
    body: 'other workspace',
  });
  askKnowledge.result.sources = [{ noteId: note.id, title: note.title, path: note.path }];
  askKnowledge.result.relatedNotes = [{ id: note.id, workspaceSlug: note.workspaceSlug }];
  askKnowledge.result.requestedAttachments = true;

  const result = await whatsapp.execute(evolutionInput('/kb /ask quero o arquivo do deploy'));

  assert.equal(result.mediaSent, 0);
  assert.equal(sender.media.length, 0);
});

test('whatsapp /ask command keeps each question isolated from previous turns', async (t) => {
  const askKnowledge = new StubAskKnowledgeUseCase();
  const { whatsapp, repositories, user } = await fixture(t, new CapturingWhatsappSender(), undefined, { askKnowledge });

  await whatsapp.execute(evolutionInput('/kb /ask qual é o deploy checklist?'));
  await whatsapp.execute(evolutionInput('/kb /ask e como executa?'));

  assert.equal(askKnowledge.calls.length, 2);
  assert.deepEqual(askKnowledge.calls[0].options, { workspaceSlug: 'default' });
  assert.deepEqual(askKnowledge.calls[1].options, { workspaceSlug: 'default' });
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

class StubAudioTranscriptionGateway {
  constructor(transcription = 'corrigi timeout no webhook') {
    this.transcription = transcription;
    this.calls = [];
  }

  async transcribe(config, input) {
    this.calls.push({ config, input });
    return this.transcription;
  }
}

test('whatsapp audio without caption is transcribed and processes the message as text', async (t) => {
  const privateJid = '5511999999999@s.whatsapp.net';
  const audioTranscription = new StubAudioTranscriptionGateway();
  const downloader = new StubWhatsappMediaDownloader(Buffer.from('hello audio').toString('base64'));
  const { whatsapp, sender, repositories, user } = await fixture(t, new CapturingWhatsappSender(), downloader, {
    audioTranscription,
    whatsappJid: privateJid,
  });

  const result = await whatsapp.execute(evolutionInput('', {
    data: {
      key: { remoteJid: privateJid, participant: '5511999999999@s.whatsapp.net', id: 'audio-msg', fromMe: false },
      message: {
        audioMessage: {
          mimetype: 'audio/ogg; codecs=opus',
          fileLength: 200,
        },
      },
    },
  }, {}, privateJid));

  assert.equal(result.processed, true);
  assert.equal(result.action, 'submit');
  assert.equal(audioTranscription.calls.length, 1);
  assert.equal(audioTranscription.calls[0].input.mimeType, 'audio/ogg; codecs=opus');
  assert.equal(audioTranscription.calls[0].input.dataBase64, Buffer.from('hello audio').toString('base64'));
  assert.equal(sender.sent.length, 1);
  assert.match(sender.sent[0].text, /^Note saved successfully:/);
  assert.match(sender.sent[0].text, /Project: N8N Automations/);
});

