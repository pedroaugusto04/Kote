import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';

import { IntegrationCredentialService } from '../../../dist/application/credentials.js';
import { IntegrationConnectionService } from '../../../dist/application/integration-connections.js';
import { GithubRepositoryResolutionService } from '../../../dist/application/services/integrations/github-repository-resolution.service.js';
import { HandleTelegramWebhookUseCase, HandleWhatsappWebhookUseCase } from '../../../dist/application/use-cases/index.js';
import { createPostgresTestRepositories } from '../../helpers/postgres-test-repositories.mjs';

function runtimeEnvironmentProvider() {
  return {
    read: () => ({
      credentialsEncryptionKey: process.env.KB_CREDENTIALS_ENCRYPTION_KEY || '',
      publicBaseUrl: process.env.KB_PUBLIC_BASE_URL || '',
      apiPublicBaseUrl: process.env.KB_API_PUBLIC_BASE_URL || '',
      githubAppInstallUrl: process.env.KB_GITHUB_APP_INSTALL_URL || '',
      githubAppId: process.env.KB_GITHUB_APP_ID || '',
      githubAppPrivateKey: process.env.KB_GITHUB_APP_PRIVATE_KEY || '',
      reviewAiProvider: process.env.KB_REVIEW_AI_PROVIDER || 'none',
      reviewAiBaseUrl: process.env.KB_REVIEW_AI_BASE_URL || 'https://ai.example.com/review',
      reviewAiModel: process.env.KB_REVIEW_AI_MODEL || 'review-model',
      reviewAiApiKey: process.env.KB_REVIEW_AI_API_KEY || '',
      conversationAiProvider: process.env.KB_CONVERSATION_AI_PROVIDER || 'none',
      conversationAiBaseUrl: process.env.KB_CONVERSATION_AI_BASE_URL || 'https://ai.example.com/conversation',
      conversationAiModel: process.env.KB_CONVERSATION_AI_MODEL || 'conversation-model',
      conversationAiApiKey: process.env.KB_CONVERSATION_AI_API_KEY || '',
      telegramBotToken: process.env.KB_TELEGRAM_BOT_TOKEN || '',
      telegramWebhookToken: process.env.KB_TELEGRAM_WEBHOOK_TOKEN || '',
      webhookSecret: process.env.KB_WEBHOOK_SECRET || '',
      whatsappWebhookApiKey: process.env.KB_WPP_WEBHOOK_API_KEY || '',
      evolutionApiKey: process.env.EVOLUTION_API_KEY || '',
    }),
  };
}

function githubIntegrationGateway() {
  return {
    verifyWebhookSignature() {},
    async fetchInstallationToken({ installationId }) {
      const response = await fetch(`https://api.github.com/app/installations/${installationId}/access_tokens`, { method: 'POST' });
      if (!response.ok) return '';
      const payload = await response.json();
      return String(payload.token || '');
    },
    async fetchComparePayload() {
      return { files: [{ filename: 'src/app.ts', status: 'modified', patch: '' }], commits: [] };
    },
    async fetchInstallationRepositories() {
      const response = await fetch('https://api.github.com/installation/repositories?per_page=100');
      if (!response.ok) return [];
      const payload = await response.json();
      return (payload.repositories || []).map((repo) => ({
        id: Number(repo.id || 0),
        fullName: String(repo.full_name || '').trim(),
        name: String(repo.name || '').trim(),
        owner: String(repo.owner?.login || '').trim(),
        private: Boolean(repo.private),
        htmlUrl: String(repo.html_url || '').trim(),
        description: repo.description == null ? null : String(repo.description),
        defaultBranch: repo.default_branch == null ? null : String(repo.default_branch),
      }));
    },
  };
}

function configureEnv() {
  process.env.KB_CREDENTIALS_ENCRYPTION_KEY = crypto.randomBytes(32).toString('base64');
  process.env.KB_WEBHOOK_SECRET = 'webhook-secret';
  process.env.KB_TELEGRAM_WEBHOOK_TOKEN = 'telegram-webhook-secret';
  process.env.KB_TELEGRAM_BOT_TOKEN = 'telegram-bot-token';
  process.env.KB_GITHUB_APP_INSTALL_URL = 'https://github.com/apps/kb/installations/new';
  process.env.KB_GITHUB_APP_ID = '12345';
  process.env.KB_GITHUB_APP_PRIVATE_KEY = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 }).privateKey.export({ type: 'pkcs8', format: 'pem' });
  process.env.KB_REVIEW_AI_PROVIDER = 'openrouter';
  process.env.KB_REVIEW_AI_API_KEY = 'review-key';
  process.env.KB_CONVERSATION_AI_PROVIDER = 'openai';
  process.env.KB_CONVERSATION_AI_API_KEY = 'conversation-key';
  process.env.KB_WPP_WEBHOOK_API_KEY = 'provider-key';
  process.env.NODE_ENV = 'test';
}

async function fixture(t) {
  configureEnv();
  const repositories = await createPostgresTestRepositories(t);
  const user = await repositories.userRepository.createUser({ email: 'owner@example.com', displayName: 'Owner', passwordHash: 'hash', role: 'user' });
  await repositories.contentRepository.upsertWorkspace(user.id, {
    workspaceSlug: 'default',
    displayName: 'Default',
    whatsappChatJid: '',
    telegramChatId: '',
    createdAt: '2026-04-27T00:00:00.000Z',
    updatedAt: '2026-04-27T00:00:00.000Z',
  });
  const environmentProvider = runtimeEnvironmentProvider();
  const githubGateway = githubIntegrationGateway();
  const githubRepositoryResolution = new GithubRepositoryResolutionService(
    repositories.contentRepository,
    repositories.credentialRepository,
    environmentProvider,
    githubGateway,
  );
  const connections = new IntegrationConnectionService(
    repositories.credentialRepository,
    repositories.externalIdentityRepository,
    repositories.connectionSessionRepository,
    repositories.contentRepository,
    githubRepositoryResolution,
    environmentProvider,
    githubGateway,
  );
  const whatsapp = new HandleWhatsappWebhookUseCase(
    repositories.externalIdentityRepository,
    repositories.credentialRepository,
    repositories.webhookEventRepository,
    { read: () => ({ webhookSecret: process.env.KB_WEBHOOK_SECRET || '', whatsappWebhookApiKey: process.env.KB_WPP_WEBHOOK_API_KEY || '', evolutionApiKey: process.env.EVOLUTION_API_KEY || '' }) },
    connections,
    undefined,
  );
  const telegram = new HandleTelegramWebhookUseCase(
    repositories.externalIdentityRepository,
    repositories.webhookEventRepository,
    environmentProvider,
    connections,
  );
  return { repositories, user, connections, whatsapp, telegram };
}

function whatsappInput(code, overrides = {}) {
  return {
    headers: {
      cookie: 'kb_access_token=secret-cookie',
      authorization: 'Bearer leaked-token',
      apikey: 'provider-key',
    },
    body: {
      userId: 'attacker-user-id',
      data: {
        key: { remoteJid: '120363@g.us' },
        message: { conversation: `/kote connect ${code}` },
      },
      token: 'payload-token',
      nested: { apiKey: 'nested-key', keep: 'visible' },
      ...overrides,
    },
  };
}

function telegramInput(code, overrides = {}) {
  return {
    headers: {
      'x-telegram-bot-api-secret-token': 'telegram-webhook-secret',
      authorization: 'Bearer leaked-token',
      ...(overrides.headers || {}),
    },
    body: {
      message: {
        chat: { id: '987654321' },
        text: `/kote connect ${code}`,
      },
      token: 'payload-token',
      ...(overrides.body || {}),
    },
  };
}

function stateFromRedirect(result) {
  const url = new URL(result.primaryAction.url);
  return url.searchParams.get('state');
}

test('connection sessions expire and can only be consumed once', async (t) => {
  const { repositories, user, connections, whatsapp } = await fixture(t);
  const expired = await connections.connect({ userId: user.id, workspaceSlug: 'default', provider: 'whatsapp' });
  await repositories.expireConnectionSession(expired.session.id);

  await assert.rejects(() => whatsapp.execute(whatsappInput(expired.verificationCode)), /connection_session_not_found/);

  const active = await connections.connect({ userId: user.id, workspaceSlug: 'default', provider: 'whatsapp' });
  const first = await whatsapp.execute(whatsappInput(active.verificationCode));
  assert.equal(first.connected, true);
  assert.equal(first.resolvedUserId, user.id);
  await assert.rejects(() => whatsapp.execute(whatsappInput(active.verificationCode)), /connection_session_not_found/);
});

test('github app callback validates state, installation ownership, conflicts and success', async (t) => {
  const { repositories, user, connections } = await fixture(t);
  await assert.rejects(
    () => connections.completeGithub({ userId: user.id, state: 'bad-state', installationId: '42' }),
    /invalid_connection_state/,
  );

  const setup = await connections.connect({ userId: user.id, workspaceSlug: 'default', provider: 'github-app' });
  const state = stateFromRedirect(setup);
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    if (String(url).includes('/access_tokens')) return new Response(null, { status: 404 });
    return new Response(null, { status: 404 });
  };
  await assert.rejects(
    () => connections.completeGithub({ userId: user.id, state, installationId: '42' }),
    /UnauthorizedException/,
  );

  const secondUser = await repositories.userRepository.createUser({ email: 'other@example.com', displayName: 'Other', passwordHash: 'hash', role: 'user' });
  await repositories.contentRepository.upsertWorkspace(secondUser.id, {
    workspaceSlug: 'default',
    displayName: 'Default',
    whatsappChatJid: '',
    telegramChatId: '',
    createdAt: '2026-04-27T00:00:00.000Z',
    updatedAt: '2026-04-27T00:00:00.000Z',
  });
  await repositories.externalIdentityRepository.upsertExternalIdentity({
    userId: secondUser.id,
    workspaceSlug: 'default',
    provider: 'github-app',
    identityType: 'installation_id',
    externalId: '42',
    publicMetadata: {},
  });
  const conflictSetup = await connections.connect({ userId: user.id, workspaceSlug: 'default', provider: 'github-app' });
  const conflictState = stateFromRedirect(conflictSetup);
  globalThis.fetch = async (url) => {
    if (String(url).includes('/access_tokens')) return Response.json({ token: 'installation-token' });
    return Response.json({
      repositories: [{ id: 42, full_name: 'acme/core', name: 'core', private: true, html_url: 'https://github.com/acme/core', owner: { login: 'acme' } }],
    });
  };
  await assert.rejects(
    () => connections.completeGithub({ userId: user.id, state: conflictState, installationId: '42' }),
    /external_identity_already_bound/,
  );

  await repositories.externalIdentityRepository.upsertExternalIdentity({
    userId: user.id,
    workspaceSlug: 'default',
    provider: 'github-app',
    identityType: 'installation_id',
    externalId: '99',
    publicMetadata: {},
  });
  const successSetup = await connections.connect({ userId: user.id, workspaceSlug: 'default', provider: 'github-app' });
  globalThis.fetch = async (url) => {
    if (String(url).includes('/access_tokens')) return Response.json({ token: 'installation-token' });
    return Response.json({
      repositories: [{ id: 99, full_name: 'acme/api', name: 'api', private: true, html_url: 'https://github.com/acme/api', owner: { login: 'acme' } }],
    });
  };
  const success = await connections.completeGithub({ userId: user.id, state: stateFromRedirect(successSetup), installationId: '99' });
  assert.equal(success.connectedAccount, 'acme');
  const credential = await repositories.credentialRepository.findCredential(user.id, 'default', 'github-app');
  assert.equal(credential.status, 'connected');
  globalThis.fetch = originalFetch;
});

test('github app callback accepts installation flow without oauth code', async (t) => {
  const { user, connections } = await fixture(t);
  const setup = await connections.connect({ userId: user.id, workspaceSlug: 'default', provider: 'github-app' });
  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = async (url) => {
      if (String(url).includes('/access_tokens')) return Response.json({ token: 'installation-token' });
      return Response.json({
        repositories: [{ id: 42, full_name: 'acme/api', name: 'api', private: true, html_url: 'https://github.com/acme/api', owner: { login: 'acme' } }],
      });
    };

    const result = await connections.completeGithub({ userId: user.id, state: stateFromRedirect(setup), installationId: '42' });
    assert.equal(result.connectedAccount, 'acme');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('github connection normalizes app settings URLs to the installation flow', async (t) => {
  const { user, connections } = await fixture(t);
  process.env.KB_GITHUB_APP_INSTALL_URL = 'https://github.com/settings/apps/kb';

  const connection = await connections.connect({ userId: user.id, workspaceSlug: 'default', provider: 'github-app' });
  const url = new URL(connection.primaryAction.url);

  assert.equal(url.origin, 'https://github.com');
  assert.equal(url.pathname, '/apps/kb/installations/new');
  assert.ok(url.searchParams.get('state'));
});

test('whatsapp connection command binds the chat even when authored by the connected number and normal unknown group messages are ignored', async (t) => {
  const { repositories, user, connections, whatsapp } = await fixture(t);
  const setup = await connections.connect({ userId: user.id, workspaceSlug: 'default', provider: 'whatsapp' });

  const result = await whatsapp.execute(whatsappInput(setup.verificationCode, {
    data: {
      key: { remoteJid: '120363@g.us', fromMe: true, id: 'connect-msg', participant: '5511999999999@s.whatsapp.net' },
      message: { conversation: `/kote connect ${setup.verificationCode}` },
    },
  }));
  assert.equal(result.resolvedUserId, user.id);

  const identity = await repositories.externalIdentityRepository.findExternalIdentity('whatsapp', 'jid', '120363@g.us');
  assert.equal(identity.userId, user.id);
  const workspaces = await repositories.contentRepository.listWorkspaces(user.id);
  assert.equal(workspaces[0].whatsappChatJid, '120363@g.us');

  const unknown = await whatsapp.execute({
    headers: { apikey: 'provider-key' },
    body: { data: { key: { remoteJid: 'unknown@g.us' }, message: { conversation: 'mensagem normal' } } },
  });
  assert.deepEqual(unknown, { ok: true, processed: false, ignored: 'missing_group_prefix' });
});

test('whatsapp connection command binds a private chat jid to the workspace', async (t) => {
  const { repositories, user, connections, whatsapp } = await fixture(t);
  const setup = await connections.connect({ userId: user.id, workspaceSlug: 'default', provider: 'whatsapp' });

  assert.deepEqual(setup.steps, [
    'Send the message in the WhatsApp chat.',
    'Keep this window open until the conversation appears as connected.',
  ]);

  const result = await whatsapp.execute(whatsappInput(setup.verificationCode, {
    data: {
      key: { remoteJid: '5511999999999@s.whatsapp.net', id: 'private-connect-msg', fromMe: false },
      message: { conversation: `/kote connect ${setup.verificationCode}` },
    },
  }));
  assert.equal(result.resolvedUserId, user.id);

  const identity = await repositories.externalIdentityRepository.findExternalIdentity('whatsapp', 'jid', '5511999999999@s.whatsapp.net');
  assert.equal(identity.userId, user.id);
  assert.equal(identity.workspaceSlug, 'default');
  const credential = await repositories.credentialRepository.findCredential(user.id, 'default', 'whatsapp');
  assert.equal(credential.publicMetadata.label, 'Chat WhatsApp');
  assert.equal(credential.publicMetadata.connectedAccount, '5511999999999@s.whatsapp.net');
  const workspaces = await repositories.contentRepository.listWorkspaces(user.id);
  assert.equal(workspaces[0].whatsappChatJid, '5511999999999@s.whatsapp.net');
});

test('whatsapp connection rejects an already-bound private chat jid for another workspace or user', async (t) => {
  const { repositories, user, connections, whatsapp } = await fixture(t);
  const setup = await connections.connect({ userId: user.id, workspaceSlug: 'default', provider: 'whatsapp' });
  await whatsapp.execute(whatsappInput(setup.verificationCode, {
    data: {
      key: { remoteJid: '5511999999999@s.whatsapp.net', id: 'private-connect-owner', fromMe: false },
      message: { conversation: `/kote connect ${setup.verificationCode}` },
    },
  }));

  await repositories.contentRepository.upsertWorkspace(user.id, {
    workspaceSlug: 'second',
    displayName: 'Second',
    whatsappChatJid: '',
    telegramChatId: '',
    createdAt: '2026-04-27T00:00:00.000Z',
    updatedAt: '2026-04-27T00:00:00.000Z',
  });
  const sameUserSetup = await connections.connect({ userId: user.id, workspaceSlug: 'second', provider: 'whatsapp' });
  await assert.rejects(
    () => whatsapp.execute(whatsappInput(sameUserSetup.verificationCode, {
      data: {
        key: { remoteJid: '5511999999999@s.whatsapp.net', id: 'private-connect-same-user-other-workspace', fromMe: false },
        message: { conversation: `/kote connect ${sameUserSetup.verificationCode}` },
      },
    })),
    /external_identity_already_bound/,
  );

  const otherUser = await repositories.userRepository.createUser({ email: 'other-whatsapp@example.com', displayName: 'Other', passwordHash: 'hash', role: 'user' });
  await repositories.contentRepository.upsertWorkspace(otherUser.id, {
    workspaceSlug: 'default',
    displayName: 'Default',
    whatsappChatJid: '',
    telegramChatId: '',
    createdAt: '2026-04-27T00:00:00.000Z',
    updatedAt: '2026-04-27T00:00:00.000Z',
  });
  const otherUserSetup = await connections.connect({ userId: otherUser.id, workspaceSlug: 'default', provider: 'whatsapp' });
  await assert.rejects(
    () => whatsapp.execute(whatsappInput(otherUserSetup.verificationCode, {
      data: {
        key: { remoteJid: '5511999999999@s.whatsapp.net', id: 'private-connect-other-user', fromMe: false },
        message: { conversation: `/kote connect ${otherUserSetup.verificationCode}` },
      },
    })),
    /external_identity_already_bound/,
  );
});

test('telegram connection command binds the chat and rejects invalid webhook token', async (t) => {
  const { repositories, user, connections, telegram } = await fixture(t);
  const setup = await connections.connect({ userId: user.id, workspaceSlug: 'default', provider: 'telegram' });

  await assert.rejects(
    () => telegram.execute(telegramInput(setup.verificationCode, { headers: { 'x-telegram-bot-api-secret-token': 'bad' } })),
    /invalid_webhook_token/,
  );

  const result = await telegram.execute(telegramInput(setup.verificationCode));
  assert.equal(result.resolvedUserId, user.id);

  const identity = await repositories.externalIdentityRepository.findExternalIdentity('telegram', 'chat_id', '987654321');
  assert.equal(identity.userId, user.id);
  const workspaces = await repositories.contentRepository.listWorkspaces(user.id);
  assert.equal(workspaces[0].telegramChatId, '987654321');

  await assert.rejects(
    () => telegram.execute({
      headers: { 'x-telegram-bot-api-secret-token': 'telegram-webhook-secret' },
      body: { message: { chat: { id: 'unknown-chat' }, text: 'mensagem normal' } },
    }),
    /identity_not_found/,
  );
});

test('ai integrations activate only with server-managed configuration and test does not leak secrets', async (t) => {
  const { repositories, user, connections } = await fixture(t);
  const review = await connections.connect({ userId: user.id, workspaceSlug: 'default', provider: 'ai-review' });
  assert.equal(review.integration.connectedAccount, 'openrouter');
  const service = new IntegrationCredentialService(
    repositories.credentialRepository,
    repositories.externalIdentityRepository,
    runtimeEnvironmentProvider(),
  );
  const status = await service.test(user.id, 'default', 'ai-review');
  assert.equal(status.configured, true);
  assert.equal(JSON.stringify(status).includes('review-key'), false);

  process.env.KB_CONVERSATION_AI_API_KEY = '';
  process.env.KB_REVIEW_AI_API_KEY = '';
  await assert.rejects(
    () => connections.connect({ userId: user.id, workspaceSlug: 'default', provider: 'ai-conversation' }),
    /conversation_ai_not_configured/,
  );
});

test('github app repositories are listed by installation token and saved into workspace projects', async (t) => {
  const { repositories, user, connections } = await fixture(t);
  const setup = await connections.connect({ userId: user.id, workspaceSlug: 'default', provider: 'github-app' });
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    const target = String(url);
    if (target.includes('/access_tokens')) return Response.json({ token: 'installation-token' });
    if (target.includes('/installation/repositories')) {
      return Response.json({
        repositories: [
          { id: 101, full_name: 'acme/api', name: 'api', private: true, html_url: 'https://github.com/acme/api', owner: { login: 'acme' } },
          { id: 102, full_name: 'acme/web', name: 'web', private: false, html_url: 'https://github.com/acme/web', owner: { login: 'acme' } },
        ],
      });
    }
    return new Response(null, { status: 404 });
  };
  await connections.completeGithub({ userId: user.id, state: stateFromRedirect(setup), installationId: '42' });

  const listed = await connections.listGithubRepositories({ userId: user.id, workspaceSlug: 'default' });
  assert.deepEqual(listed.repositories.map((repo) => repo.fullName), ['acme/api', 'acme/web']);

  const saved = await connections.saveGithubRepositories({ 
    userId: user.id, 
    workspaceSlug: 'default', 
    repositories: [
      { id: '101', fullName: 'acme/api' },
      { id: '101', fullName: 'acme/api' }
    ] 
  });
  assert.deepEqual(saved.repositories, [{ id: '101', fullName: 'acme/api' }]);
  const projects = await repositories.contentRepository.listProjects(user.id);
  const apiProject = projects.find((project) => project.projectSlug === 'api');
  assert.equal(apiProject.repositories[0].fullName, 'acme/api');
  assert.equal(apiProject.repositories[0].externalId, '101');
  globalThis.fetch = originalFetch;
});

test('guided integrations reject missing workspace and github callback keeps browser return path', async (t) => {
  const { repositories, user, connections } = await fixture(t);
  await repositories.contentRepository.upsertWorkspace(user.id, {
    workspaceSlug: 'product-team',
    displayName: 'Product Team',
    whatsappChatJid: '',
    telegramChatId: '',
    createdAt: '2026-04-27T00:00:00.000Z',
    updatedAt: '2026-04-27T00:00:00.000Z',
  });

  await assert.rejects(
    () => connections.connect({ userId: user.id, workspaceSlug: 'missing-team', provider: 'whatsapp' }),
    /workspace_not_found/,
  );

  const setup = await connections.connect({
    userId: user.id,
    workspaceSlug: 'product-team',
    provider: 'github-app',
    returnToPath: '/kote/setup',
    browserOrigin: 'https://kb.example.com',
  });
  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = async (url) => {
      if (String(url).includes('/access_tokens')) return Response.json({ token: 'installation-token' });
      return Response.json({
        repositories: [{ id: 55, full_name: 'acme/product', name: 'product', private: true, html_url: 'https://github.com/acme/product', owner: { login: 'acme' } }],
      });
    };

    const result = await connections.completeGithub({ userId: user.id, state: stateFromRedirect(setup), installationId: '55' });
    assert.equal(result.redirectUrl, 'https://kb.example.com/kote/setup?integration=github-app&status=connected&workspaceSlug=product-team');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('github callback fallback redirect preserves base path from public base url', async (t) => {
  const { user, connections } = await fixture(t);
  const previousPublicBaseUrl = process.env.KB_PUBLIC_BASE_URL;
  const originalFetch = globalThis.fetch;
  try {
    process.env.KB_PUBLIC_BASE_URL = 'https://kb.example.com/kote';

    const setup = await connections.connect({
      userId: user.id,
      workspaceSlug: 'default',
      provider: 'github-app',
    });
    globalThis.fetch = async (url) => {
      if (String(url).includes('/access_tokens')) return Response.json({ token: 'installation-token' });
      return Response.json({
        repositories: [{ id: 42, full_name: 'acme/default', name: 'default', private: true, html_url: 'https://github.com/acme/default', owner: { login: 'acme' } }],
      });
    };

    const result = await connections.completeGithub({ userId: user.id, state: stateFromRedirect(setup), installationId: '42' });
    assert.equal(result.redirectUrl, 'https://kb.example.com/kote/settings/integrations?integration=github-app&status=connected&workspaceSlug=default');
  } finally {
    globalThis.fetch = originalFetch;
    process.env.KB_PUBLIC_BASE_URL = previousPublicBaseUrl;
  }
});

test('webhook event logs redact sensitive headers and payload recursively', async (t) => {
  const { repositories, user, connections, whatsapp } = await fixture(t);
  const setup = await connections.connect({ userId: user.id, workspaceSlug: 'default', provider: 'whatsapp' });
  await whatsapp.execute(whatsappInput(setup.verificationCode));

  const event = await repositories.getLastWebhookEvent();
  assert.equal(event.rawHeaders.authorization, '[redacted]');
  assert.equal(event.rawHeaders.cookie, '[redacted]');
  assert.equal(event.rawHeaders.apikey, '[redacted]');
  assert.equal(event.rawPayload.token, '[redacted]');
  assert.equal(event.rawPayload.nested.apiKey, '[redacted]');
  assert.equal(event.rawPayload.nested.keep, 'visible');
});

test('sends automatic introduction message when whatsapp/telegram connects', async (t) => {
  configureEnv();
  const repositories = await createPostgresTestRepositories(t);
  const user = await repositories.userRepository.createUser({ email: 'owner-intro@example.com', displayName: 'Owner', passwordHash: 'hash', role: 'user' });
  await repositories.contentRepository.upsertWorkspace(user.id, {
    workspaceSlug: 'default',
    displayName: 'Default',
    whatsappChatJid: '',
    telegramChatId: '',
    createdAt: '2026-04-27T00:00:00.000Z',
    updatedAt: '2026-04-27T00:00:00.000Z',
  });
  const environmentProvider = runtimeEnvironmentProvider();
  const githubGateway = githubIntegrationGateway();
  const githubRepositoryResolution = new GithubRepositoryResolutionService(
    repositories.contentRepository,
    repositories.credentialRepository,
    environmentProvider,
    githubGateway,
  );

  const mockWhatsappSender = {
    sentTextCalls: [],
    async sendText(input) {
      this.sentTextCalls.push(input);
      return { ok: true };
    },
    async sendMedia(input) {
      return { ok: true };
    }
  };

  const mockTelegramSender = {
    sentTextCalls: [],
    async sendText(input) {
      this.sentTextCalls.push(input);
      return { ok: true };
    }
  };

  const connections = new IntegrationConnectionService(
    repositories.credentialRepository,
    repositories.externalIdentityRepository,
    repositories.connectionSessionRepository,
    repositories.contentRepository,
    githubRepositoryResolution,
    environmentProvider,
    githubGateway,
    mockWhatsappSender,
    mockTelegramSender,
  );

  // 1. WhatsApp Connection
  const wppSetup = await connections.connect({ userId: user.id, workspaceSlug: 'default', provider: 'whatsapp' });
  await connections.completeWhatsappFromWebhook({
    code: wppSetup.verificationCode,
    chatJid: '5511999999999@s.whatsapp.net',
  });

  assert.equal(mockWhatsappSender.sentTextCalls.length, 1);
  assert.equal(mockWhatsappSender.sentTextCalls[0].chatJid, '5511999999999@s.whatsapp.net');
  assert.ok(mockWhatsappSender.sentTextCalls[0].text.startsWith('Connection established successfully!'));
  assert.ok(mockWhatsappSender.sentTextCalls[0].text.includes('This is your WhatsApp channel'));

  // 2. Telegram Connection
  const tgSetup = await connections.connect({ userId: user.id, workspaceSlug: 'default', provider: 'telegram' });
  await connections.completeTelegramFromWebhook({
    code: tgSetup.verificationCode,
    chatId: '987654321',
  });

  assert.equal(mockTelegramSender.sentTextCalls.length, 1);
  assert.equal(mockTelegramSender.sentTextCalls[0].chatId, '987654321');
  assert.ok(mockTelegramSender.sentTextCalls[0].text.startsWith('Connection established successfully!'));
  assert.ok(mockTelegramSender.sentTextCalls[0].text.includes('This is your Telegram channel'));
});

