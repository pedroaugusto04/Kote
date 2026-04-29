import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';

import { AuthService } from '../dist/application/auth.js';
import { IntegrationConnectionService } from '../dist/application/integration-connections.js';
import { IntegrationCredentialService } from '../dist/application/credentials.js';
import { createMemoryRepositories } from '../dist/infrastructure/repositories/memory-repositories.js';
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
  const repositories = createMemoryRepositories();
  const auth = new AuthService(repositories.userRepository, repositories.schemaMigrator);
  await auth.onModuleInit();
  const admin = await repositories.userRepository.findUserByEmail('admin@example.com');
  if (admin) {
    await repositories.contentRepository.upsertWorkspace(admin.id, {
      workspaceSlug: 'default',
      displayName: 'Default',
      whatsappGroupJid: '',
      telegramChatId: '',
      githubRepos: [],
      projectSlugs: ['inbox'],
      createdAt: '2026-04-27T00:00:00.000Z',
      updatedAt: '2026-04-27T00:00:00.000Z',
    });
  }
  return {
    repositories,
    auth,
    credentials: new IntegrationCredentialService(repositories.credentialRepository, repositories.externalIdentityRepository),
    connections: new IntegrationConnectionService(
      repositories.credentialRepository,
      repositories.externalIdentityRepository,
      repositories.connectionSessionRepository,
      repositories.contentRepository,
    ),
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
  const { auth, repositories } = await fixture();
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
  assert.ok(await repositories.userRepository.findUserByEmail('new@example.com'));
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

test('guided credentials are encrypted, never returned, and resolved internally by userId or external identity', async () => {
  const { auth, repositories, credentials, connections } = await fixture();
  const authController = new AuthController(auth);
  const userController = new UserIntegrationsController(auth, credentials, connections);
  const internalController = new InternalIntegrationsController(credentials);

  const loginResponse = responseMock();
  const login = await authController.login(
    { email: 'admin@example.com', password: 'admin-password' },
    { headers: { origin: 'https://kb.example.com', host: 'kb.example.com' }, protocol: 'https' },
    loginResponse,
  );
  const accessToken = loginResponse.cookies.find((cookie) => cookie.name === 'kb_access_token').value;
  const request = { headers: { origin: 'https://kb.example.com', host: 'kb.example.com', cookie: `kb_access_token=${accessToken}` }, protocol: 'https' };

  const setup = await userController.connect(
    { provider: 'whatsapp' },
    { workspaceSlug: 'default' },
    login.user,
    request,
  );
  const saved = await connections.completeWhatsappFromWebhook({ code: setup.verificationCode, groupJid: '120363@g.us' });

  assert.equal(saved.session.status, 'connected');

  const stored = await repositories.credentialRepository.findCredential(login.user.id, 'default', 'whatsapp');
  assert.ok(stored);
  assert.equal(JSON.stringify(stored.encryptedConfig).includes('120363@g.us'), false);

  const resolvedByUser = await internalController.resolve(
    { provider: 'whatsapp' },
    { workspaceSlug: 'default', userId: login.user.id },
    { headers: { authorization: 'Bearer internal-token' } },
  );
  assert.deepEqual(resolvedByUser.config, { groupJid: '120363@g.us' });

  const resolvedByIdentity = await internalController.resolve(
    { provider: 'whatsapp' },
    { workspaceSlug: 'default', externalIdentity: { provider: 'whatsapp', identityType: 'jid', externalId: '120363@g.us' } },
    { headers: { authorization: 'Bearer internal-token' } },
  );
  assert.equal(resolvedByIdentity.userId, login.user.id);

  const listed = await userController.list(login.user, request, { workspaceSlug: 'default' });
  assert.equal(JSON.stringify(listed).includes('encryptedConfig'), false);

  const revoked = await userController.revoke({ provider: 'whatsapp' }, { workspaceSlug: 'default' }, login.user, request);
  assert.equal(revoked.integration.status, 'revoked');
  const revokedStored = await repositories.credentialRepository.findCredential(login.user.id, 'default', 'whatsapp');
  assert.equal(JSON.stringify(revokedStored.encryptedConfig).includes('120363@g.us'), false);
});

test('guided connection rejects identity hijacking', async () => {
  const first = await fixture();
  const firstAuthController = new AuthController(first.auth);
  const firstUserController = new UserIntegrationsController(first.auth, first.credentials, first.connections);
  const firstLoginResponse = responseMock();
  const firstLogin = await firstAuthController.login(
    { email: 'admin@example.com', password: 'admin-password' },
    { headers: { origin: 'https://kb.example.com', host: 'kb.example.com' }, protocol: 'https' },
    firstLoginResponse,
  );
  const firstAccessToken = firstLoginResponse.cookies.find((cookie) => cookie.name === 'kb_access_token').value;
  const firstRequest = { headers: { origin: 'https://kb.example.com', host: 'kb.example.com', cookie: `kb_access_token=${firstAccessToken}` }, protocol: 'https' };

  const firstSetup = await firstUserController.connect(
    { provider: 'whatsapp' },
    { workspaceSlug: 'default' },
    firstLogin.user,
    firstRequest,
  );
  await first.connections.completeWhatsappFromWebhook({ code: firstSetup.verificationCode, groupJid: '120363@g.us' });

  const secondRepositories = first.repositories;
  const secondAuth = new AuthService(secondRepositories.userRepository, secondRepositories.schemaMigrator);
  const secondCredentials = new IntegrationCredentialService(secondRepositories.credentialRepository, secondRepositories.externalIdentityRepository);
  const secondConnections = new IntegrationConnectionService(
    secondRepositories.credentialRepository,
    secondRepositories.externalIdentityRepository,
    secondRepositories.connectionSessionRepository,
    secondRepositories.contentRepository,
  );
  const secondUser = await secondRepositories.userRepository.createUser({ email: 'user@example.com', passwordHash: firstLogin.user.id, role: 'user' });
  await secondRepositories.contentRepository.upsertWorkspace(secondUser.id, {
    workspaceSlug: 'default',
    displayName: 'Default',
    whatsappGroupJid: '',
    telegramChatId: '',
    githubRepos: [],
    projectSlugs: ['inbox'],
    createdAt: '2026-04-27T00:00:00.000Z',
    updatedAt: '2026-04-27T00:00:00.000Z',
  });
  const secondController = new UserIntegrationsController(secondAuth, secondCredentials, secondConnections);
  const secondToken = secondAuth.issueTokens(secondUser).accessToken;
  const secondCurrentUser = { id: secondUser.id, email: secondUser.email, displayName: secondUser.displayName, role: secondUser.role };
  const secondSetup = await secondController.connect(
    { provider: 'whatsapp' },
    { workspaceSlug: 'default' },
    secondCurrentUser,
    { headers: { origin: 'https://kb.example.com', host: 'kb.example.com', cookie: `kb_access_token=${secondToken}` }, protocol: 'https' },
  );

  await assert.rejects(
    () => secondConnections.completeWhatsappFromWebhook({ code: secondSetup.verificationCode, groupJid: '120363@g.us' }),
    /external_identity_already_bound/,
  );
});
