import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';

import { AuthService } from '../../../dist/application/auth.js';
import { IntegrationConnectionService } from '../../../dist/application/integration-connections.js';
import { IntegrationCredentialService } from '../../../dist/application/credentials.js';
import { GithubRepositoryResolutionService } from '../../../dist/application/services/integrations/github-repository-resolution.service.js';
import { TrustedOriginGuard } from '../../../dist/interfaces/http/guards/auth.guards.js';
import { AuthController, InternalIntegrationsController, UserIntegrationsController } from '../../../dist/interfaces/http/controllers/index.js';
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
      telegramBotToken: process.env.KB_TELEGRAM_BOT_TOKEN || '',
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
  process.env.KB_ADMIN_EMAIL = 'admin@example.com';
  process.env.KB_ADMIN_PASSWORD = 'admin-password';
  process.env.KB_JWT_ACCESS_SECRET = 'access-secret-for-tests';
  process.env.KB_JWT_REFRESH_SECRET = 'refresh-secret-for-tests';
  process.env.KB_ACCESS_TOKEN_TTL_SECONDS = '60';
  process.env.KB_REFRESH_TOKEN_TTL_SECONDS = '3600';
  process.env.KB_CREDENTIALS_ENCRYPTION_KEY = crypto.randomBytes(32).toString('base64');
  process.env.KB_INTERNAL_SERVICE_TOKEN = 'internal-token';
  process.env.KB_PUBLIC_BASE_URL = 'https://kb.example.com';
  process.env.KB_TELEGRAM_BOT_TOKEN = 'telegram-bot-token';
  process.env.KB_GOOGLE_OAUTH_CLIENT_ID = 'google-client-id';
  process.env.KB_GOOGLE_OAUTH_CLIENT_SECRET = 'google-client-secret';
  process.env.KB_GOOGLE_OAUTH_REDIRECT_URI = 'https://kb.example.com/api/auth/google/callback';
  process.env.NODE_ENV = 'test';
}

function responseMock() {
  return {
    cookies: [],
    cleared: [],
    headers: {},
    body: undefined,
    redirectedTo: '',
    cookie(name, value, options) {
      this.cookies.push({ name, value, options });
    },
    clearCookie(name, options) {
      this.cleared.push({ name, options });
    },
    setHeader(name, value) {
      this.headers[name.toLowerCase()] = value;
    },
    send(body) {
      this.body = body;
    },
    redirect(url) {
      this.redirectedTo = url;
    },
  };
}

async function fixture(t, options = {}) {
  configureEnv();
  const repositories = await createPostgresTestRepositories(t);
  const auth = new AuthService(repositories.userRepository, repositories.schemaMigrator, undefined, options.googleGateway, repositories.objectStorage);
  await auth.onModuleInit();
  const admin = await repositories.userRepository.findUserByEmail('admin@example.com');
  if (admin) {
    await repositories.contentRepository.upsertWorkspace(admin.id, {
      workspaceSlug: 'default',
      displayName: 'Default',
      whatsappChatJid: '',
      telegramChatId: '',
      githubRepos: [],
      projectSlugs: ['inbox'],
      createdAt: '2026-04-27T00:00:00.000Z',
      updatedAt: '2026-04-27T00:00:00.000Z',
    });
  }
  const environmentProvider = runtimeEnvironmentProvider();
  const githubGateway = githubIntegrationGateway();
  const githubRepositoryResolution = new GithubRepositoryResolutionService(
    repositories.contentRepository,
    repositories.credentialRepository,
    environmentProvider,
    githubGateway,
  );
  return {
    repositories,
    auth,
    credentials: new IntegrationCredentialService(
      repositories.credentialRepository,
      repositories.externalIdentityRepository,
      environmentProvider,
      repositories.contentRepository,
    ),
    connections: new IntegrationConnectionService(
      repositories.credentialRepository,
      repositories.externalIdentityRepository,
      repositories.connectionSessionRepository,
      repositories.contentRepository,
      githubRepositoryResolution,
      environmentProvider,
      githubGateway,
    ),
  };
}

function googleGateway(profile = {}) {
  return {
    buildAuthorizationUrl(input) {
      return `https://accounts.google.com/o/oauth2/v2/auth?state=${encodeURIComponent(input.state)}&code_challenge=${encodeURIComponent(input.codeChallenge)}`;
    },
    async authenticate() {
      return {
        providerUserId: profile.providerUserId || 'google-user-1',
        email: profile.email || 'google.user@example.com',
        emailVerified: profile.emailVerified ?? true,
        displayName: profile.displayName || 'Google User',
        pictureUrl: profile.pictureUrl || 'https://lh3.googleusercontent.com/user',
      };
    },
  };
}

test('login creates HttpOnly cookies and does not return tokens in JSON', async (t) => {
  const { auth } = await fixture(t);
  const controller = new AuthController(auth);
  const response = responseMock();

  const result = await controller.login(
    { email: 'admin@example.com', password: 'admin-password' },
    { headers: { origin: 'https://kb.example.com', host: 'kb.example.com' }, protocol: 'https' },
    response,
  );

  assert.equal(result.ok, true);
  assert.equal(result.user.email, 'admin@example.com');
  assert.equal(result.user.avatarUrl, null);
  assert.equal(JSON.stringify(result).includes('accessToken'), false);
  assert.equal(JSON.stringify(result).includes('refreshToken'), false);
  assert.deepEqual(response.cookies.map((cookie) => cookie.name), ['kb_access_token', 'kb_refresh_token']);
  assert.equal(response.cookies.every((cookie) => cookie.options.httpOnly), true);
  assert.equal(response.cookies.every((cookie) => cookie.options.sameSite === 'lax'), true);
});

test('current authenticated user shape includes avatarUrl', async (t) => {
  const { auth } = await fixture(t);
  const controller = new AuthController(auth);
  const response = responseMock();
  const login = await controller.login(
    { email: 'admin@example.com', password: 'admin-password' },
    { headers: { origin: 'https://kb.example.com', host: 'kb.example.com' }, protocol: 'https' },
    response,
  );

  assert.deepEqual(controller.me(login.user), { ok: true, user: { ...login.user, avatarUrl: null } });
});

test('avatar upload rejects unsupported MIME types', async (t) => {
  const { auth } = await fixture(t);
  const controller = new AuthController(auth);
  const login = await controller.login(
    { email: 'admin@example.com', password: 'admin-password' },
    { headers: { origin: 'https://kb.example.com', host: 'kb.example.com' }, protocol: 'https' },
    responseMock(),
  );

  await assert.rejects(
    () => controller.uploadAvatar(login.user, {
      buffer: Buffer.from('not an image'),
      mimetype: 'text/plain',
      size: 12,
      originalname: 'avatar.txt',
    }),
    /unsupported_avatar_type/,
  );
});

test('avatar upload rejects files over 3MB', async (t) => {
  const { auth } = await fixture(t);
  const controller = new AuthController(auth);
  const login = await controller.login(
    { email: 'admin@example.com', password: 'admin-password' },
    { headers: { origin: 'https://kb.example.com', host: 'kb.example.com' }, protocol: 'https' },
    responseMock(),
  );

  await assert.rejects(
    () => controller.uploadAvatar(login.user, {
      buffer: Buffer.alloc((3 * 1024 * 1024) + 1),
      mimetype: 'image/png',
      size: (3 * 1024 * 1024) + 1,
      originalname: 'avatar.png',
    }),
    /avatar_file_too_large/,
  );
});

test('avatar upload stores bytes and returns the updated user', async (t) => {
  const { auth, repositories } = await fixture(t);
  const controller = new AuthController(auth);
  const login = await controller.login(
    { email: 'admin@example.com', password: 'admin-password' },
    { headers: { origin: 'https://kb.example.com', host: 'kb.example.com' }, protocol: 'https' },
    responseMock(),
  );
  const image = Buffer.from([0x89, 0x50, 0x4e, 0x47]);

  const result = await controller.uploadAvatar(login.user, {
    buffer: image,
    mimetype: 'image/png',
    size: image.length,
    originalname: 'avatar.png',
  });

  const storedUser = await repositories.userRepository.findUserById(login.user.id);
  assert.equal(result.ok, true);
  assert.match(result.user.avatarUrl, /^\/api\/auth\/avatar\/content\?t=\d+$/);
  assert.match(storedUser.avatar, new RegExp(`^users/${login.user.id}/profile/avatar-\\d+\\.png$`));
  assert.deepEqual(repositories.objectStorage.objects.get(storedUser.avatar), image);
});

test('avatar remove clears fields and deletes the previous storage key best-effort', async (t) => {
  const { auth, repositories } = await fixture(t);
  const controller = new AuthController(auth);
  const login = await controller.login(
    { email: 'admin@example.com', password: 'admin-password' },
    { headers: { origin: 'https://kb.example.com', host: 'kb.example.com' }, protocol: 'https' },
    responseMock(),
  );
  await controller.uploadAvatar(login.user, {
    buffer: Buffer.from('webp-image'),
    mimetype: 'image/webp',
    size: 10,
    originalname: 'avatar.webp',
  });
  const uploaded = await repositories.userRepository.findUserById(login.user.id);

  const removed = await controller.deleteAvatar(login.user);
  const storedUser = await repositories.userRepository.findUserById(login.user.id);

  assert.equal(removed.user.avatarUrl, null);
  assert.equal(storedUser.avatar, '');
  assert.equal(repositories.objectStorage.objects.has(uploaded.avatar), false);
  assert.equal(repositories.objectStorage.deletedKeys.includes(uploaded.avatar), true);
});

test('avatar content endpoint returns bytes and blocks missing avatars', async (t) => {
  const { auth } = await fixture(t);
  const controller = new AuthController(auth);
  const login = await controller.login(
    { email: 'admin@example.com', password: 'admin-password' },
    { headers: { origin: 'https://kb.example.com', host: 'kb.example.com' }, protocol: 'https' },
    responseMock(),
  );

  await assert.rejects(() => controller.avatarContent(login.user, responseMock()), /avatar_not_found/);

  const image = Buffer.from('jpeg-image');
  await controller.uploadAvatar(login.user, {
    buffer: image,
    mimetype: 'image/jpeg',
    size: image.length,
    originalname: 'avatar.jpg',
  });
  const response = responseMock();

  await controller.avatarContent(login.user, response);

  assert.equal(response.headers['content-type'], 'image/jpeg');
  assert.equal(response.headers['cache-control'], 'private, max-age=3600');
  assert.deepEqual(response.body, image);
});

test('signup creates a user and HttpOnly cookies', async (t) => {
  const { auth, repositories } = await fixture(t);
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

test('signup duplicate email returns a field error', async (t) => {
  const { auth } = await fixture(t);
  const controller = new AuthController(auth);

  await assert.rejects(
    () => controller.signup(
      { name: 'Admin', email: 'admin@example.com', password: 'admin-password' },
      { headers: { origin: 'https://kb.example.com', host: 'kb.example.com' }, protocol: 'https' },
      responseMock(),
    ),
    (error) => {
      assert.equal(error.getResponse().code, 'email_already_registered');
      assert.deepEqual(error.getResponse().details.fieldErrors, { email: 'This email is already registered.' });
      return true;
    },
  );
});

test('refresh issues a new access cookie and logout clears browser cookies', async (t) => {
  const { auth } = await fixture(t);
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

test('google callback creates a user, identity, and HttpOnly auth cookies', async (t) => {
  const { auth, repositories } = await fixture(t, { googleGateway: googleGateway() });
  const controller = new AuthController(auth);
  const startResponse = responseMock();
  controller.startGoogle('/auth?mode=signup', { headers: { host: 'kb.example.com' }, protocol: 'https' }, startResponse);

  const stateCookie = startResponse.cookies.find((cookie) => cookie.name === 'kb_google_oauth_state');
  const state = new URL(startResponse.redirectedTo).searchParams.get('state');
  const callbackResponse = responseMock();
  await controller.googleCallback(
    'google-code',
    state,
    { headers: { cookie: `kb_google_oauth_state=${encodeURIComponent(stateCookie.value)}` } },
    callbackResponse,
  );

  const user = await repositories.userRepository.findUserByEmail('google.user@example.com');
  assert.ok(user);
  assert.equal(user.passwordHash, null);
  assert.ok(await repositories.userRepository.findAuthIdentity('google', 'google-user-1'));
  assert.deepEqual(callbackResponse.cookies.map((cookie) => cookie.name), ['kb_access_token', 'kb_refresh_token']);
  assert.equal(callbackResponse.cookies.every((cookie) => cookie.options.httpOnly), true);
  assert.equal(callbackResponse.cleared.some((cookie) => cookie.name === 'kb_google_oauth_state'), true);
  assert.equal(callbackResponse.redirectedTo, '/auth?mode=signup');
});

test('google callback reuses an existing identity', async (t) => {
  const { auth, repositories } = await fixture(t, { googleGateway: googleGateway({ email: 'repeat@example.com' }) });
  const controller = new AuthController(auth);
  const firstStart = responseMock();
  controller.startGoogle('/auth', { headers: { host: 'kb.example.com' }, protocol: 'https' }, firstStart);
  await controller.googleCallback(
    'google-code-1',
    new URL(firstStart.redirectedTo).searchParams.get('state'),
    { headers: { cookie: `kb_google_oauth_state=${encodeURIComponent(firstStart.cookies.find((cookie) => cookie.name === 'kb_google_oauth_state').value)}` } },
    responseMock(),
  );
  const user = await repositories.userRepository.findUserByEmail('repeat@example.com');

  const secondStart = responseMock();
  controller.startGoogle('/auth', { headers: { host: 'kb.example.com' }, protocol: 'https' }, secondStart);
  const secondResponse = responseMock();
  await controller.googleCallback(
    'google-code-2',
    new URL(secondStart.redirectedTo).searchParams.get('state'),
    { headers: { cookie: `kb_google_oauth_state=${encodeURIComponent(secondStart.cookies.find((cookie) => cookie.name === 'kb_google_oauth_state').value)}` } },
    secondResponse,
  );

  assert.equal((await repositories.userRepository.findUserByEmail('repeat@example.com')).id, user.id);
  assert.deepEqual(secondResponse.cookies.map((cookie) => cookie.name), ['kb_access_token', 'kb_refresh_token']);
});

test('google callback redirects with conflict when email has no google identity', async (t) => {
  const { auth, repositories } = await fixture(t, { googleGateway: googleGateway({ email: 'password-user@example.com' }) });
  await repositories.createTestUser({ email: 'password-user@example.com', passwordHash: 'scrypt$salt$hash' });
  const controller = new AuthController(auth);
  const startResponse = responseMock();
  controller.startGoogle('/auth', { headers: { host: 'kb.example.com' }, protocol: 'https' }, startResponse);
  const callbackResponse = responseMock();

  await controller.googleCallback(
    'google-code',
    new URL(startResponse.redirectedTo).searchParams.get('state'),
    { headers: { cookie: `kb_google_oauth_state=${encodeURIComponent(startResponse.cookies.find((cookie) => cookie.name === 'kb_google_oauth_state').value)}` } },
    callbackResponse,
  );

  assert.equal(callbackResponse.redirectedTo, '/auth?error=email_already_registered');
  assert.equal(await repositories.userRepository.findAuthIdentity('google', 'google-user-1'), null);
});

test('google callback with invalid state redirects without creating a session', async (t) => {
  const { auth, repositories } = await fixture(t, { googleGateway: googleGateway() });
  const controller = new AuthController(auth);
  const callbackResponse = responseMock();

  await controller.googleCallback('google-code', 'wrong-state', { headers: {} }, callbackResponse);

  assert.equal(callbackResponse.redirectedTo, '/auth?error=google_auth_failed');
  assert.equal(callbackResponse.cookies.length, 0);
  assert.equal(await repositories.userRepository.findUserByEmail('google.user@example.com'), null);
});

test('google callback with invalid state redirects prepending base path from environment publicBaseUrl', async (t) => {
  const { auth, repositories } = await fixture(t, { googleGateway: googleGateway() });
  const originalBaseUrl = process.env.KB_PUBLIC_BASE_URL;
  try {
    process.env.KB_PUBLIC_BASE_URL = 'https://kb.example.com/kote';
    const controller = new AuthController(auth);
    const callbackResponse = responseMock();

    await controller.googleCallback('google-code', 'wrong-state', { headers: {} }, callbackResponse);

    assert.equal(callbackResponse.redirectedTo, '/kote/auth?error=google_auth_failed');
    assert.equal(callbackResponse.cookies.length, 0);
    assert.equal(await repositories.userRepository.findUserByEmail('google.user@example.com'), null);
  } finally {
    process.env.KB_PUBLIC_BASE_URL = originalBaseUrl;
  }
});

test('google-created user cannot login with password', async (t) => {
  const { auth } = await fixture(t, { googleGateway: googleGateway({ email: 'no-password@example.com' }) });
  const controller = new AuthController(auth);
  const startResponse = responseMock();
  controller.startGoogle('/auth', { headers: { host: 'kb.example.com' }, protocol: 'https' }, startResponse);
  await controller.googleCallback(
    'google-code',
    new URL(startResponse.redirectedTo).searchParams.get('state'),
    { headers: { cookie: `kb_google_oauth_state=${encodeURIComponent(startResponse.cookies.find((cookie) => cookie.name === 'kb_google_oauth_state').value)}` } },
    responseMock(),
  );

  await assert.rejects(
    () => auth.login('no-password@example.com', 'password123'),
    /invalid_credentials/,
  );
});

test('trusted origin guard rejects invalid Origin for mutable browser endpoints', async () => {
  const guard = new TrustedOriginGuard();

  assert.throws(
    () => guard.canActivate({
      switchToHttp: () => ({
        getRequest: () => ({ headers: { origin: 'https://evil.example.com', host: 'kb.example.com' }, protocol: 'https' }),
      }),
    }),
    /invalid_origin/,
  );
});

test('guided credentials are encrypted, never returned, and resolved internally by userId or external identity', async (t) => {
  const { auth, repositories, credentials, connections } = await fixture(t);
  const authController = new AuthController(auth);
  const userController = new UserIntegrationsController(credentials, connections);
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
  const saved = await connections.completeWhatsappFromWebhook({ code: setup.verificationCode, chatJid: '120363@g.us' });

  assert.equal(saved.session.status, 'connected');

  const stored = await repositories.credentialRepository.findCredential(login.user.id, 'default', 'whatsapp');
  assert.ok(stored);
  assert.equal(JSON.stringify(stored.encryptedConfig).includes('120363@g.us'), false);

  const resolvedByUser = await internalController.resolve(
    { provider: 'whatsapp' },
    { workspaceSlug: 'default', userId: login.user.id },
  );
  assert.deepEqual(resolvedByUser.config, { chatJid: '120363@g.us' });

  const resolvedByIdentity = await internalController.resolve(
    { provider: 'whatsapp' },
    { workspaceSlug: 'default', externalIdentity: { provider: 'whatsapp', identityType: 'jid', externalId: '120363@g.us' } },
  );
  assert.equal(resolvedByIdentity.userId, login.user.id);

  const listed = await userController.list(login.user, { workspaceSlug: 'default' });
  assert.equal(JSON.stringify(listed).includes('encryptedConfig'), false);

  const revoked = await userController.revoke({ provider: 'whatsapp' }, { workspaceSlug: 'default' }, login.user);
  assert.equal(revoked.integration.status, 'revoked');
  const revokedStored = await repositories.credentialRepository.findCredential(login.user.id, 'default', 'whatsapp');
  assert.equal(JSON.stringify(revokedStored.encryptedConfig).includes('120363@g.us'), false);
  const revokedIdentity = await repositories.externalIdentityRepository.findExternalIdentity('whatsapp', 'jid', '120363@g.us');
  assert.equal(revokedIdentity, null);
  const revokedWorkspace = await repositories.contentRepository.listWorkspaces(login.user.id);
  assert.equal(revokedWorkspace[0].whatsappChatJid, '');
});

test('telegram can reconnect after revoke because revoke clears the previous binding state', async (t) => {
  const { auth, repositories, credentials, connections } = await fixture(t);
  const authController = new AuthController(auth);
  const userController = new UserIntegrationsController(credentials, connections);

  const loginResponse = responseMock();
  const login = await authController.login(
    { email: 'admin@example.com', password: 'admin-password' },
    { headers: { origin: 'https://kb.example.com', host: 'kb.example.com' }, protocol: 'https' },
    loginResponse,
  );
  const accessToken = loginResponse.cookies.find((cookie) => cookie.name === 'kb_access_token').value;
  const request = { headers: { origin: 'https://kb.example.com', host: 'kb.example.com', cookie: `kb_access_token=${accessToken}` }, protocol: 'https' };

  const firstSetup = await userController.connect(
    { provider: 'telegram' },
    { workspaceSlug: 'default' },
    login.user,
    request,
  );
  await connections.completeTelegramFromWebhook({ code: firstSetup.verificationCode, chatId: '987654321' });

  const revoked = await userController.revoke({ provider: 'telegram' }, { workspaceSlug: 'default' }, login.user);
  assert.equal(revoked.integration.status, 'revoked');
  assert.equal(await repositories.externalIdentityRepository.findExternalIdentity('telegram', 'chat_id', '987654321'), null);
  const revokedWorkspaces = await repositories.contentRepository.listWorkspaces(login.user.id);
  assert.equal(revokedWorkspaces[0].telegramChatId, '');

  const secondSetup = await userController.connect(
    { provider: 'telegram' },
    { workspaceSlug: 'default' },
    login.user,
    request,
  );
  const reconnected = await connections.completeTelegramFromWebhook({ code: secondSetup.verificationCode, chatId: '987654321' });
  assert.equal(reconnected.session.status, 'connected');
  const restoredIdentity = await repositories.externalIdentityRepository.findExternalIdentity('telegram', 'chat_id', '987654321');
  assert.equal(restoredIdentity?.userId, login.user.id);
  const restoredWorkspaces = await repositories.contentRepository.listWorkspaces(login.user.id);
  assert.equal(restoredWorkspaces[0].telegramChatId, '987654321');
});

test('guided connection rejects identity hijacking', async (t) => {
  const first = await fixture(t);
  const firstAuthController = new AuthController(first.auth);
  const firstUserController = new UserIntegrationsController(first.credentials, first.connections);
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
  await first.connections.completeWhatsappFromWebhook({ code: firstSetup.verificationCode, chatJid: '120363@g.us' });

  const secondRepositories = first.repositories;
  const secondAuth = new AuthService(secondRepositories.userRepository, secondRepositories.schemaMigrator);
  const secondEnvironmentProvider = runtimeEnvironmentProvider();
  const secondCredentials = new IntegrationCredentialService(
    secondRepositories.credentialRepository,
    secondRepositories.externalIdentityRepository,
    secondEnvironmentProvider,
    secondRepositories.contentRepository,
  );
  const secondGithubGateway = githubIntegrationGateway();
  const secondGithubRepositoryResolution = new GithubRepositoryResolutionService(
    secondRepositories.contentRepository,
    secondRepositories.credentialRepository,
    secondEnvironmentProvider,
    secondGithubGateway,
  );
  const secondConnections = new IntegrationConnectionService(
    secondRepositories.credentialRepository,
    secondRepositories.externalIdentityRepository,
    secondRepositories.connectionSessionRepository,
    secondRepositories.contentRepository,
    secondGithubRepositoryResolution,
    secondEnvironmentProvider,
    secondGithubGateway,
  );
  const secondUser = await secondRepositories.userRepository.createUser({ email: 'user@example.com', passwordHash: firstLogin.user.id, role: 'user' });
  await secondRepositories.contentRepository.upsertWorkspace(secondUser.id, {
    workspaceSlug: 'default',
    displayName: 'Default',
    whatsappChatJid: '',
    telegramChatId: '',
    githubRepos: [],
    projectSlugs: ['inbox'],
    createdAt: '2026-04-27T00:00:00.000Z',
    updatedAt: '2026-04-27T00:00:00.000Z',
  });
  const secondController = new UserIntegrationsController(secondCredentials, secondConnections);
  const secondToken = secondAuth.jwtService.issueTokens(secondUser).accessToken;
  const secondCurrentUser = { id: secondUser.id, email: secondUser.email, displayName: secondUser.displayName, role: secondUser.role };
  const secondSetup = await secondController.connect(
    { provider: 'whatsapp' },
    { workspaceSlug: 'default' },
    secondCurrentUser,
    { headers: { origin: 'https://kb.example.com', host: 'kb.example.com', cookie: `kb_access_token=${secondToken}` }, protocol: 'https' },
  );

  await assert.rejects(
    () => secondConnections.completeWhatsappFromWebhook({ code: secondSetup.verificationCode, chatJid: '120363@g.us' }),
    /external_identity_already_bound/,
  );
});

test('guarded user integrations controller depends on current user instead of reauthenticating request cookies', async (t) => {
  const { auth, credentials, connections } = await fixture(t);
  const authController = new AuthController(auth);
  const userController = new UserIntegrationsController(credentials, connections);
  const loginResponse = responseMock();
  await authController.login(
    { email: 'admin@example.com', password: 'admin-password' },
    { headers: { origin: 'https://kb.example.com', host: 'kb.example.com' }, protocol: 'https' },
    loginResponse,
  );
  const accessToken = loginResponse.cookies.find((cookie) => cookie.name === 'kb_access_token').value;

  await assert.rejects(
    () => userController.connect(
      { provider: 'whatsapp' },
      { workspaceSlug: 'default' },
      undefined,
      { headers: { origin: 'https://kb.example.com', host: 'kb.example.com', cookie: `kb_access_token=${accessToken}` }, protocol: 'https' },
    ),
  );
});

test('connection token generation and exchange flow', async (t) => {
  const { auth } = await fixture(t);
  const controller = new AuthController(auth);

  const loginResponse = responseMock();
  const login = await controller.login(
    { email: 'admin@example.com', password: 'admin-password' },
    { headers: { origin: 'https://kb.example.com', host: 'kb.example.com' }, protocol: 'https' },
    loginResponse,
  );

  // 1. Generate connection token
  const result = await controller.connectionToken(login.user);
  assert.equal(result.ok, true);
  assert.ok(result.connectionToken.startsWith('kbc_'));

  // 2. Exchange connection token for real tokens
  const exchangeResult = await controller.exchangeConnectionToken({
    connectionToken: result.connectionToken,
  });

  assert.equal(exchangeResult.ok, true);
  assert.ok(exchangeResult.accessToken);
  assert.ok(exchangeResult.refreshToken);

  // 3. Re-exchanging or using an invalid token rejects
  await assert.rejects(
    () => controller.exchangeConnectionToken({ connectionToken: 'kbc_invalidtoken' }),
    /invalid_token/,
  );

  await assert.rejects(
    () => controller.exchangeConnectionToken({ connectionToken: 'invalid_no_prefix' }),
    /invalid_connection_token/,
  );
});
