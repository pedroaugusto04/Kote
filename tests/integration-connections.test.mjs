import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';

import { IntegrationCredentialService } from '../dist/application/credentials.js';
import { IntegrationConnectionService } from '../dist/application/integration-connections.js';
import { HandleTelegramWebhookUseCase, HandleWhatsappWebhookUseCase, IngestEntryUseCase } from '../dist/application/use-cases/index.js';
import { createMemoryRepositories } from '../dist/infrastructure/repositories/memory-repositories.js';

function configureEnv() {
  process.env.KB_CREDENTIALS_ENCRYPTION_KEY = crypto.randomBytes(32).toString('base64');
  process.env.KB_WEBHOOK_SECRET = 'webhook-secret';
  process.env.KB_TELEGRAM_WEBHOOK_TOKEN = 'telegram-webhook-secret';
  process.env.KB_TELEGRAM_BOT_TOKEN = 'telegram-bot-token';
  process.env.KB_GITHUB_APP_INSTALL_URL = 'https://github.com/apps/kb/installations/new';
  process.env.KB_GITHUB_APP_CLIENT_ID = 'client-id';
  process.env.KB_GITHUB_APP_CLIENT_SECRET = 'client-secret';
  process.env.KB_GITHUB_APP_ID = '12345';
  process.env.KB_GITHUB_APP_PRIVATE_KEY = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 }).privateKey.export({ type: 'pkcs8', format: 'pem' });
  process.env.KB_REVIEW_AI_PROVIDER = 'openrouter';
  process.env.KB_REVIEW_AI_API_KEY = 'review-key';
  process.env.KB_CONVERSATION_AI_PROVIDER = 'openai';
  process.env.KB_CONVERSATION_AI_API_KEY = 'conversation-key';
  process.env.NODE_ENV = 'test';
}

async function fixture() {
  configureEnv();
  const repositories = createMemoryRepositories();
  const user = await repositories.userRepository.createUser({ email: 'owner@example.com', displayName: 'Owner', passwordHash: 'hash', role: 'user' });
  await repositories.contentRepository.upsertWorkspace(user.id, {
    workspaceSlug: 'default',
    displayName: 'Default',
    whatsappGroupJid: '',
    telegramChatId: '',
    githubRepos: [],
    projectSlugs: ['inbox'],
    createdAt: '2026-04-27T00:00:00.000Z',
    updatedAt: '2026-04-27T00:00:00.000Z',
  });
  const connections = new IntegrationConnectionService(
    repositories.credentialRepository,
    repositories.externalIdentityRepository,
    repositories.connectionSessionRepository,
    repositories.contentRepository,
  );
  const ingest = new IngestEntryUseCase(repositories.contentRepository);
  const whatsapp = new HandleWhatsappWebhookUseCase(ingest, repositories.externalIdentityRepository, repositories.webhookEventRepository, connections);
  const telegram = new HandleTelegramWebhookUseCase(repositories.externalIdentityRepository, repositories.webhookEventRepository, connections);
  return { repositories, user, connections, whatsapp, telegram };
}

function whatsappInput(code, overrides = {}) {
  return {
    headers: {
      authorization: 'Bearer webhook-secret',
      cookie: 'kb_access_token=secret-cookie',
      apikey: 'provider-key',
    },
    body: {
      userId: 'attacker-user-id',
      data: {
        key: { remoteJid: '120363@g.us' },
        message: { conversation: `/kb conectar ${code}` },
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
        text: `/kb conectar ${code}`,
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

test('connection sessions expire and can only be consumed once', async () => {
  const { repositories, user, connections, whatsapp } = await fixture();
  const expired = await connections.connect({ userId: user.id, workspaceSlug: 'default', provider: 'whatsapp' });
  repositories.state.connectionSessions.get(expired.session.id).expiresAt = new Date(Date.now() - 1000).toISOString();

  await assert.rejects(() => whatsapp.execute(whatsappInput(expired.verificationCode)), /connection_session_not_found/);

  const active = await connections.connect({ userId: user.id, workspaceSlug: 'default', provider: 'whatsapp' });
  const first = await whatsapp.execute(whatsappInput(active.verificationCode));
  assert.equal(first.connected, true);
  assert.equal(first.resolvedUserId, user.id);
  await assert.rejects(() => whatsapp.execute(whatsappInput(active.verificationCode)), /connection_session_not_found/);
});

test('github app callback validates state, installation ownership, conflicts and success', async () => {
  const { repositories, user, connections } = await fixture();
  await assert.rejects(
    () => connections.completeGithub({ userId: user.id, state: 'bad-state', code: 'code', installationId: '42' }),
    /invalid_connection_state/,
  );

  const setup = await connections.connect({ userId: user.id, workspaceSlug: 'default', provider: 'github-app' });
  const state = stateFromRedirect(setup);
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    if (String(url).includes('/login/oauth/access_token')) return Response.json({ access_token: 'oauth-token' });
    return Response.json({ installations: [{ id: 7, account: { login: 'other' } }] });
  };
  await assert.rejects(
    () => connections.completeGithub({ userId: user.id, state, code: 'code', installationId: '42' }),
    /github_installation_not_accessible/,
  );

  const secondUser = await repositories.userRepository.createUser({ email: 'other@example.com', displayName: 'Other', passwordHash: 'hash', role: 'user' });
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
    if (String(url).includes('/login/oauth/access_token')) return Response.json({ access_token: 'oauth-token' });
    return Response.json({ installations: [{ id: 42, account: { login: 'acme' } }] });
  };
  await assert.rejects(
    () => connections.completeGithub({ userId: user.id, state: conflictState, code: 'code', installationId: '42' }),
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
    if (String(url).includes('/login/oauth/access_token')) return Response.json({ access_token: 'oauth-token' });
    return Response.json({ installations: [{ id: 99, account: { login: 'acme' } }] });
  };
  const success = await connections.completeGithub({ userId: user.id, state: stateFromRedirect(successSetup), code: 'code', installationId: '99' });
  assert.equal(success.connectedAccount, 'acme');
  const credential = await repositories.credentialRepository.findCredential(user.id, 'default', 'github-app');
  assert.equal(credential.status, 'connected');
  globalThis.fetch = originalFetch;
});

test('whatsapp connection command binds the group without trusting userId payload and normal unknown messages stay rejected', async () => {
  const { repositories, user, connections, whatsapp } = await fixture();
  const setup = await connections.connect({ userId: user.id, workspaceSlug: 'default', provider: 'whatsapp' });

  const result = await whatsapp.execute(whatsappInput(setup.verificationCode));
  assert.equal(result.resolvedUserId, user.id);

  const identity = await repositories.externalIdentityRepository.findExternalIdentity('whatsapp', 'jid', '120363@g.us');
  assert.equal(identity.userId, user.id);
  const workspaces = await repositories.contentRepository.listWorkspaces(user.id);
  assert.equal(workspaces[0].whatsappGroupJid, '120363@g.us');

  await assert.rejects(
    () => whatsapp.execute({
      headers: { authorization: 'Bearer webhook-secret' },
      body: { data: { key: { remoteJid: 'unknown@g.us' }, message: { conversation: 'mensagem normal' } } },
    }),
    /identity_not_found/,
  );
});

test('telegram connection command binds the chat and rejects invalid webhook token', async () => {
  const { repositories, user, connections, telegram } = await fixture();
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

test('ai integrations activate only with server-managed configuration and test does not leak secrets', async () => {
  const { repositories, user, connections } = await fixture();
  const review = await connections.connect({ userId: user.id, workspaceSlug: 'default', provider: 'ai-review' });
  assert.equal(review.integration.connectedAccount, 'openrouter');
  const service = new IntegrationCredentialService(
    repositories.credentialRepository,
    repositories.externalIdentityRepository,
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

test('github app repositories are listed by installation token and saved into workspace projects', async () => {
  const { repositories, user, connections } = await fixture();
  const setup = await connections.connect({ userId: user.id, workspaceSlug: 'default', provider: 'github-app' });
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    const target = String(url);
    if (target.includes('/login/oauth/access_token')) return Response.json({ access_token: 'oauth-token' });
    if (target.includes('/user/installations')) return Response.json({ installations: [{ id: 42, account: { login: 'acme' } }] });
    if (target.includes('/access_tokens')) return Response.json({ token: 'installation-token' });
    if (target.includes('/installation/repositories')) {
      return Response.json({
        repositories: [
          { full_name: 'acme/api', name: 'api', private: true, html_url: 'https://github.com/acme/api', owner: { login: 'acme' } },
          { full_name: 'acme/web', name: 'web', private: false, html_url: 'https://github.com/acme/web', owner: { login: 'acme' } },
        ],
      });
    }
    return new Response(null, { status: 404 });
  };
  await connections.completeGithub({ userId: user.id, state: stateFromRedirect(setup), code: 'code', installationId: '42' });

  const listed = await connections.listGithubRepositories({ userId: user.id, workspaceSlug: 'default' });
  assert.deepEqual(listed.repositories.map((repo) => repo.fullName), ['acme/api', 'acme/web']);

  const saved = await connections.saveGithubRepositories({ userId: user.id, workspaceSlug: 'default', repositories: ['acme/api', 'acme/api'] });
  assert.deepEqual(saved.repositories, ['acme/api']);
  const workspaces = await repositories.contentRepository.listWorkspaces(user.id);
  assert.deepEqual(workspaces[0].githubRepos, ['acme/api']);
  const projects = await repositories.contentRepository.listProjects(user.id);
  assert.equal(projects.find((project) => project.projectSlug === 'api').repoFullName, 'acme/api');
  globalThis.fetch = originalFetch;
});

test('guided integrations reject missing workspace and github callback keeps browser return path', async () => {
  const { repositories, user, connections } = await fixture();
  await repositories.contentRepository.upsertWorkspace(user.id, {
    workspaceSlug: 'product-team',
    displayName: 'Product Team',
    whatsappGroupJid: '',
    telegramChatId: '',
    githubRepos: [],
    projectSlugs: ['inbox'],
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
    returnToPath: '/setup',
    browserOrigin: 'https://kb.example.com',
  });
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    if (String(url).includes('/login/oauth/access_token')) return Response.json({ access_token: 'oauth-token' });
    return Response.json({ installations: [{ id: 55, account: { login: 'acme' } }] });
  };

  const result = await connections.completeGithub({ userId: user.id, state: stateFromRedirect(setup), code: 'code', installationId: '55' });
  assert.equal(result.redirectUrl, 'https://kb.example.com/setup?integration=github-app&status=connected&workspaceSlug=product-team');
  globalThis.fetch = originalFetch;
});

test('webhook event logs redact sensitive headers and payload recursively', async () => {
  const { repositories, user, connections, whatsapp } = await fixture();
  const setup = await connections.connect({ userId: user.id, workspaceSlug: 'default', provider: 'whatsapp' });
  await whatsapp.execute(whatsappInput(setup.verificationCode));

  const event = Array.from(repositories.state.webhookEvents.values()).at(-1);
  assert.equal(event.rawHeaders.authorization, '[redacted]');
  assert.equal(event.rawHeaders.cookie, '[redacted]');
  assert.equal(event.rawHeaders.apikey, '[redacted]');
  assert.equal(event.rawPayload.token, '[redacted]');
  assert.equal(event.rawPayload.nested.apiKey, '[redacted]');
  assert.equal(event.rawPayload.nested.keep, 'visible');
});
