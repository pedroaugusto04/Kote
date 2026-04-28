import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';

import { AuthService } from '../dist/application/auth.js';
import { IntegrationCredentialService } from '../dist/application/credentials.js';
import { MemoryKnowledgeStore } from '../dist/application/knowledge-store.js';
import { AuthController, InternalIntegrationsController, UserIntegrationsController } from '../dist/interfaces/http/controllers/index.js';

function configureEnv() {
  process.env.KB_ADMIN_EMAIL = 'admin@example.com';
  process.env.KB_ADMIN_PASSWORD = 'admin-password';
  process.env.KB_JWT_ACCESS_SECRET = 'access-secret-for-tests';
  process.env.KB_JWT_REFRESH_SECRET = 'refresh-secret-for-tests';
  process.env.KB_ACCESS_TOKEN_TTL_SECONDS = '60';
  process.env.KB_REFRESH_TOKEN_TTL_SECONDS = '3600';
  process.env.KB_CREDENTIALS_ENCRYPTION_KEY = crypto.randomBytes(32).toString('base64');
  process.env.KB_INTERNAL_SERVICE_TOKEN = 'internal-token';
  process.env.KB_PUBLIC_BASE_URL = 'https://kb.example.com';
  process.env.NODE_ENV = 'test';
}

function responseMock() {
  return {
    cookies: [],
    cleared: [],
    cookie(name, value, options) {
      this.cookies.push({ name, value, options });
    },
    clearCookie(name, options) {
      this.cleared.push({ name, options });
    },
  };
}

async function fixture() {
  configureEnv();
  const store = new MemoryKnowledgeStore();
  const auth = new AuthService(store);
  await auth.onModuleInit();
  return {
    store,
    auth,
    credentials: new IntegrationCredentialService(store),
  };
}

test('login creates HttpOnly cookies and does not return tokens in JSON', async () => {
  const { auth } = await fixture();
  const controller = new AuthController(auth);
  const response = responseMock();

  const result = await controller.login(
    { email: 'admin@example.com', password: 'admin-password' },
    { headers: { origin: 'https://kb.example.com', host: 'kb.example.com' }, protocol: 'https' },
    response,
  );

  assert.equal(result.ok, true);
  assert.equal(result.user.email, 'admin@example.com');
  assert.equal(JSON.stringify(result).includes('accessToken'), false);
  assert.equal(JSON.stringify(result).includes('refreshToken'), false);
  assert.deepEqual(response.cookies.map((cookie) => cookie.name), ['kb_access_token', 'kb_refresh_token']);
  assert.equal(response.cookies.every((cookie) => cookie.options.httpOnly), true);
  assert.equal(response.cookies.every((cookie) => cookie.options.sameSite === 'lax'), true);
});

test('signup creates a user and HttpOnly cookies', async () => {
  const { auth, store } = await fixture();
  const controller = new AuthController(auth);
  const response = responseMock();

  const result = await controller.signup(
    { name: 'New User', email: 'new@example.com', password: 'new-password' },
    { headers: { origin: 'https://kb.example.com', host: 'kb.example.com' }, protocol: 'https' },
    response,
  );

  assert.equal(result.ok, true);
  assert.equal(result.user.email, 'new@example.com');
  assert.equal(result.user.displayName, 'New User');
  assert.ok(await store.findUserByEmail('new@example.com'));
  assert.deepEqual(response.cookies.map((cookie) => cookie.name), ['kb_access_token', 'kb_refresh_token']);
});

test('refresh issues a new access cookie and logout clears browser cookies', async () => {
  const { auth } = await fixture();
  const controller = new AuthController(auth);
  const loginResponse = responseMock();
  await controller.login(
    { email: 'admin@example.com', password: 'admin-password' },
    { headers: { origin: 'https://kb.example.com', host: 'kb.example.com' }, protocol: 'https' },
    loginResponse,
  );

  const refreshToken = loginResponse.cookies.find((cookie) => cookie.name === 'kb_refresh_token').value;
  const refreshResponse = responseMock();
  const refreshed = await controller.refresh(
    { headers: { origin: 'https://kb.example.com', cookie: `kb_refresh_token=${refreshToken}`, host: 'kb.example.com' }, protocol: 'https' },
    refreshResponse,
  );

  assert.equal(refreshed.ok, true);
  assert.equal(refreshResponse.cookies.some((cookie) => cookie.name === 'kb_access_token'), true);

  const logoutResponse = responseMock();
  assert.deepEqual(controller.logout({ headers: { origin: 'https://kb.example.com', host: 'kb.example.com' }, protocol: 'https' }, logoutResponse), { ok: true });
  assert.deepEqual(logoutResponse.cleared.map((cookie) => cookie.name), ['kb_access_token', 'kb_refresh_token']);
});

test('mutable browser endpoints reject invalid Origin', async () => {
  const { auth } = await fixture();
  const controller = new AuthController(auth);

  await assert.rejects(
    () => controller.login({ email: 'admin@example.com', password: 'admin-password' }, { headers: { origin: 'https://evil.example.com', host: 'kb.example.com' }, protocol: 'https' }, responseMock()),
    /invalid_origin/,
  );
});

test('credentials are encrypted, masked in user responses, and resolved internally by userId or external identity', async () => {
  const { auth, store, credentials } = await fixture();
  const authController = new AuthController(auth);
  const userController = new UserIntegrationsController(auth, credentials);
  const internalController = new InternalIntegrationsController(credentials);

  const loginResponse = responseMock();
  const login = await authController.login(
    { email: 'admin@example.com', password: 'admin-password' },
    { headers: { origin: 'https://kb.example.com', host: 'kb.example.com' }, protocol: 'https' },
    loginResponse,
  );
  const accessToken = loginResponse.cookies.find((cookie) => cookie.name === 'kb_access_token').value;
  const request = { headers: { origin: 'https://kb.example.com', host: 'kb.example.com', cookie: `kb_access_token=${accessToken}` }, protocol: 'https' };

  const saved = await userController.save(
    { provider: 'telegram' },
    {
      workspaceSlug: 'default',
      config: { botToken: 'telegram-secret-value', chatId: '123' },
      publicMetadata: { label: 'ops bot' },
      externalIdentities: [{ provider: 'telegram', externalId: '123' }],
    },
    login.user,
    request,
  );

  assert.equal(saved.integration.status, 'connected');
  assert.deepEqual(saved.integration.maskedConfig, { botToken: '********', chatId: '********' });
  assert.equal(JSON.stringify(saved).includes('telegram-secret-value'), false);

  const stored = await store.findCredential(login.user.id, 'default', 'telegram');
  assert.ok(stored);
  assert.equal(JSON.stringify(stored.encryptedConfig).includes('telegram-secret-value'), false);

  const resolvedByUser = await internalController.resolve(
    { provider: 'telegram' },
    { workspaceSlug: 'default', userId: login.user.id },
    { headers: { authorization: 'Bearer internal-token' } },
  );
  assert.deepEqual(resolvedByUser.config, { botToken: 'telegram-secret-value', chatId: '123' });

  const resolvedByIdentity = await internalController.resolve(
    { provider: 'telegram' },
    { workspaceSlug: 'default', externalIdentity: { provider: 'telegram', identityType: 'chat_id', externalId: '123' } },
    { headers: { authorization: 'Bearer internal-token' } },
  );
  assert.equal(resolvedByIdentity.userId, login.user.id);

  const listed = await userController.list(login.user, request, { workspaceSlug: 'default' });
  assert.equal(JSON.stringify(listed).includes('telegram-secret-value'), false);

  const revoked = await userController.revoke({ provider: 'telegram' }, { workspaceSlug: 'default' }, login.user, request);
  assert.equal(revoked.integration.status, 'revoked');
  const revokedStored = await store.findCredential(login.user.id, 'default', 'telegram');
  assert.equal(JSON.stringify(revokedStored.encryptedConfig).includes('telegram-secret-value'), false);
});

test('credential identity binding rejects hijacking and invalid provider linkage', async () => {
  const first = await fixture();
  const firstAuthController = new AuthController(first.auth);
  const firstUserController = new UserIntegrationsController(first.auth, first.credentials);
  const firstLoginResponse = responseMock();
  const firstLogin = await firstAuthController.login(
    { email: 'admin@example.com', password: 'admin-password' },
    { headers: { origin: 'https://kb.example.com', host: 'kb.example.com' }, protocol: 'https' },
    firstLoginResponse,
  );
  const firstAccessToken = firstLoginResponse.cookies.find((cookie) => cookie.name === 'kb_access_token').value;
  const firstRequest = { headers: { origin: 'https://kb.example.com', host: 'kb.example.com', cookie: `kb_access_token=${firstAccessToken}` }, protocol: 'https' };

  await firstUserController.save(
    { provider: 'telegram' },
    {
      workspaceSlug: 'default',
      config: { botToken: 'secret', chatId: '123' },
      publicMetadata: { label: 'ops bot' },
      externalIdentities: [{ provider: 'telegram', externalId: '123' }],
    },
    firstLogin.user,
    firstRequest,
  );

  await assert.rejects(
    () => firstUserController.save(
      { provider: 'ai-review' },
      {
        workspaceSlug: 'default',
        config: { apiKey: 'secret', model: 'review-model' },
        publicMetadata: { label: 'review' },
        externalIdentities: [{ provider: 'telegram', externalId: '456' }],
      },
      firstLogin.user,
      firstRequest,
    ),
    /external_identity_not_allowed_for_provider/,
  );

  const secondStore = first.store;
  const secondAuth = new AuthService(secondStore);
  const secondCredentials = new IntegrationCredentialService(secondStore);
  const secondUser = await secondStore.createUser({ email: 'user@example.com', passwordHash: firstLogin.user.id, role: 'user' });
  const secondController = new UserIntegrationsController(secondAuth, secondCredentials);
  const secondToken = secondAuth.issueTokens(secondUser).accessToken;

  await assert.rejects(
    () => secondController.save(
      { provider: 'telegram' },
      {
        workspaceSlug: 'default',
        config: { botToken: 'other-secret', chatId: '123' },
        publicMetadata: { label: 'other bot' },
        externalIdentities: [{ provider: 'telegram', externalId: '123' }],
      },
      { id: secondUser.id, email: secondUser.email, displayName: secondUser.displayName, role: secondUser.role },
      { headers: { origin: 'https://kb.example.com', host: 'kb.example.com', cookie: `kb_access_token=${secondToken}` }, protocol: 'https' },
    ),
    /external_identity_already_bound/,
  );
});
