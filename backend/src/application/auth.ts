import crypto from 'node:crypto';
import { promisify } from 'node:util';

import { BadRequestException, ConflictException, Injectable, NotFoundException, OnModuleInit, UnauthorizedException } from '@nestjs/common';

import type { KbUser } from './models/repository-records.models.js';
import { JwtTokenType } from '../contracts/enums.js';
import { GoogleOAuthGateway, type GoogleOAuthProfile } from './ports/auth/google-oauth.gateway.js';
import { ObjectStorage, ObjectStorageMissingContentError } from './ports/notes/object-storage.js';
import { SchemaMigrator, UserRepository } from './ports/auth/auth.repository.js';
import { RuntimeEnvironmentProvider } from './ports/observability/runtime-environment.port.js';
import { readEnvironment } from '../adapters/environment.js';

const scrypt = promisify(crypto.scrypt);

export type AuthenticatedUser = {
  id: string;
  email: string;
  displayName: string;
  role: string;
  avatarUrl: string | null;
};

export type AvatarContent = {
  body: Buffer;
  mimeType: string;
};

export type TokenPair = {
  accessToken: string;
  refreshToken: string;
  accessTokenMaxAgeSeconds: number;
  refreshTokenMaxAgeSeconds: number;
};

type JwtPayload = {
  sub: string;
  email: string;
  role: string;
  typ: JwtTokenType;
  iat: number;
  exp: number;
};

type GoogleOAuthStatePayload = {
  state: string;
  codeVerifier: string;
  returnTo: string;
  expiresAt: number;
};

const googleAuthProvider = 'google';
const googleOAuthStateTtlMs = 10 * 60 * 1000;
export const avatarMaxSizeBytes = 2 * 1024 * 1024;
const avatarMimeTypes = new Map([
  ['image/png', 'png'],
  ['image/jpeg', 'jpg'],
  ['image/webp', 'webp'],
]);
const avatarStorageReadAttempts = 5;
const avatarStorageReadDelayMs = 150;

function base64url(input: Buffer | string): string {
  return Buffer.from(input).toString('base64url');
}

function parseBase64urlJson(value: string): unknown {
  return JSON.parse(Buffer.from(value, 'base64url').toString('utf8')) as unknown;
}

async function hashPassword(password: string): Promise<string> {
  const salt = crypto.randomBytes(16).toString('base64url');
  const derived = (await scrypt(password, salt, 64)) as Buffer;
  return `scrypt$${salt}$${derived.toString('base64url')}`;
}

async function verifyPassword(password: string, storedHash: string): Promise<boolean> {
  const [algorithm, salt, hash] = storedHash.split('$');
  if (algorithm !== 'scrypt' || !salt || !hash) return false;
  const derived = (await scrypt(password, salt, 64)) as Buffer;
  const expected = Buffer.from(hash, 'base64url');
  return expected.length === derived.length && crypto.timingSafeEqual(expected, derived);
}

function signJwt(payload: Omit<JwtPayload, 'iat' | 'exp'>, secret: string, ttlSeconds: number): string {
  if (!secret) throw new Error('jwt_secret_not_configured');
  const issuedAt = Math.floor(Date.now() / 1000);
  const header = { alg: 'HS256', typ: 'JWT' };
  const body: JwtPayload = { ...payload, iat: issuedAt, exp: issuedAt + ttlSeconds };
  const signingInput = `${base64url(JSON.stringify(header))}.${base64url(JSON.stringify(body))}`;
  const signature = crypto.createHmac('sha256', secret).update(signingInput).digest('base64url');
  return `${signingInput}.${signature}`;
}

function verifyJwt(token: string, secret: string, expectedType: JwtPayload['typ']): JwtPayload {
  if (!secret) throw new UnauthorizedException('jwt_secret_not_configured');
  const [encodedHeader, encodedPayload, signature] = token.split('.');
  if (!encodedHeader || !encodedPayload || !signature) throw new UnauthorizedException('invalid_token');
  const signingInput = `${encodedHeader}.${encodedPayload}`;
  const expected = crypto.createHmac('sha256', secret).update(signingInput).digest('base64url');
  if (signature.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) {
    throw new UnauthorizedException('invalid_token');
  }
  const payload = parseBase64urlJson(encodedPayload) as JwtPayload;
  if (payload.typ !== expectedType) throw new UnauthorizedException('invalid_token_type');
  if (!payload.sub || !payload.email || !payload.role || !payload.exp) throw new UnauthorizedException('invalid_token');
  if (payload.exp <= Math.floor(Date.now() / 1000)) throw new UnauthorizedException('token_expired');
  return payload;
}

function sha256Base64url(value: string): string {
  return crypto.createHash('sha256').update(value).digest('base64url');
}

function normalizeReturnTo(value: string | undefined, publicBaseUrl?: string): string {
  let trimmed = String(value || '/').trim() || '/';
  if (!trimmed.startsWith('/') || trimmed.startsWith('//') || trimmed.includes('\\')) {
    throw new BadRequestException('return_to_path_must_be_relative');
  }
  if (publicBaseUrl) {
    try {
      const parsed = new URL(publicBaseUrl);
      const basePath = parsed.pathname.replace(/\/$/, '');
      if (basePath && basePath !== '/' && !trimmed.startsWith(basePath)) {
        trimmed = `${basePath}${trimmed}`;
      }
    } catch {
      // Ignore URL parsing errors
    }
  }
  return trimmed;
}

function stateSigningSecret(environment: { jwtAccessSecret: string; jwtRefreshSecret: string }): string {
  return environment.jwtAccessSecret || environment.jwtRefreshSecret;
}

function signGoogleOAuthState(payload: GoogleOAuthStatePayload, secret: string): string {
  if (!secret) throw new Error('jwt_secret_not_configured');
  const encoded = base64url(JSON.stringify(payload));
  const signature = crypto.createHmac('sha256', secret).update(encoded).digest('base64url');
  return `${encoded}.${signature}`;
}

function verifyGoogleOAuthState(cookieValue: string | undefined, secret: string): GoogleOAuthStatePayload {
  if (!secret) throw new Error('jwt_secret_not_configured');
  if (!cookieValue) throw new UnauthorizedException('invalid_google_oauth_state');
  const [encoded, signature] = cookieValue.split('.');
  if (!encoded || !signature) throw new UnauthorizedException('invalid_google_oauth_state');
  const expected = crypto.createHmac('sha256', secret).update(encoded).digest('base64url');
  if (signature.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) {
    throw new UnauthorizedException('invalid_google_oauth_state');
  }
  const payload = parseBase64urlJson(encoded) as GoogleOAuthStatePayload;
  if (!payload.state || !payload.codeVerifier || !payload.returnTo || !payload.expiresAt) {
    throw new UnauthorizedException('invalid_google_oauth_state');
  }
  if (payload.expiresAt <= Date.now()) throw new UnauthorizedException('invalid_google_oauth_state');
  return payload;
}

function appendQueryParam(path: string, key: string, value: string): string {
  const [pathnameWithQuery, hash = ''] = path.split('#', 2);
  const [pathname, query = ''] = pathnameWithQuery.split('?', 2);
  const params = new URLSearchParams(query);
  params.set(key, value);
  const nextQuery = params.toString();
  return `${pathname}${nextQuery ? `?${nextQuery}` : ''}${hash ? `#${hash}` : ''}`;
}

export function parseCookies(cookieHeader: string | undefined): Record<string, string> {
  if (!cookieHeader) return {};
  return Object.fromEntries(
    cookieHeader
      .split(';')
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => {
        const index = part.indexOf('=');
        if (index === -1) return [part, ''];
        return [part.slice(0, index), decodeURIComponent(part.slice(index + 1))];
      }),
  );
}

function toAuthenticatedUser(user: KbUser): AuthenticatedUser {
  return {
    id: user.id,
    email: user.email,
    displayName: user.displayName,
    role: user.role,
    avatarUrl: user.avatar ? `/api/auth/avatar/content` : null,
  };
}

function requireAvatarStorage(storage: ObjectStorage | undefined): ObjectStorage {
  if (!storage) throw new Error('avatar_storage_not_configured');
  return storage;
}

function avatarStorageKey(userId: string, mimeType: string): string {
  const extension = avatarMimeTypes.get(mimeType);
  if (!extension) throw new BadRequestException('unsupported_avatar_type');
  return `users/${userId}/profile/avatar-${Date.now()}.${extension}`;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function getStoredAvatarWithRetry(storage: ObjectStorage, storageKey: string): Promise<Buffer> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= avatarStorageReadAttempts; attempt += 1) {
    try {
      return await storage.get(storageKey);
    } catch (error) {
      lastError = error;
      if (!(error instanceof ObjectStorageMissingContentError) || attempt === avatarStorageReadAttempts) break;
      await delay(avatarStorageReadDelayMs);
    }
  }
  throw lastError;
}

@Injectable()
export class AuthService implements OnModuleInit {
  constructor(
    private readonly users: UserRepository,
    private readonly schemaMigrator: SchemaMigrator,
    private readonly environmentProvider: RuntimeEnvironmentProvider = { read: () => readEnvironment() },
    private readonly googleOAuth?: GoogleOAuthGateway,
    private readonly objectStorage?: ObjectStorage,
  ) {}

  async onModuleInit() {
    await this.schemaMigrator.migrate();
    const environment = this.environmentProvider.read();
    if (!environment.adminEmail || !environment.adminPassword) return;
    const existing = await this.users.findUserByEmail(environment.adminEmail);
    if (existing) return;
    await this.users.createUser({
      email: environment.adminEmail,
      displayName: 'Admin',
      passwordHash: await hashPassword(environment.adminPassword),
      role: 'admin',
    });
  }

  async signup(input: { email: string; password: string; name: string }): Promise<{ user: AuthenticatedUser; tokens: TokenPair }> {
    const email = String(input.email || '').trim().toLowerCase();
    const displayName = String(input.name || '').trim();
    const password = String(input.password || '');
    if (!email || !email.includes('@')) throw new UnauthorizedException('invalid_signup');
    if (password.length < 8) throw new UnauthorizedException('invalid_signup');
    if (!displayName) throw new UnauthorizedException('invalid_signup');
    const existing = await this.users.findUserByEmail(email);
    if (existing) {
      throw new ConflictException({
        code: 'email_already_registered',
        details: { fieldErrors: { email: 'This email is already registered.' } },
      });
    }
    const user = await this.users.createUser({
      email,
      displayName,
      passwordHash: await hashPassword(password),
      role: 'user',
    });
    return { user: toAuthenticatedUser(user), tokens: this.issueTokens(user) };
  }

  async login(email: string, password: string): Promise<{ user: AuthenticatedUser; tokens: TokenPair }> {
    const user = await this.users.findUserByEmail(String(email || '').trim().toLowerCase());
    if (!user?.passwordHash || !(await verifyPassword(password, user.passwordHash))) {
      throw new UnauthorizedException('invalid_credentials');
    }
    return { user: toAuthenticatedUser(user), tokens: this.issueTokens(user) };
  }

  startGoogleOAuth(input: { returnTo?: string }): { authorizationUrl: string; stateCookie: string; stateCookieMaxAgeSeconds: number } {
    const environment = this.environmentProvider.read();
    if (!this.googleOAuth || !environment.googleOAuthClientId || !environment.googleOAuthClientSecret || !environment.googleOAuthRedirectUri) {
      throw new BadRequestException('google_oauth_not_configured');
    }
    const state = crypto.randomBytes(32).toString('base64url');
    const codeVerifier = crypto.randomBytes(64).toString('base64url');
    const returnTo = normalizeReturnTo(input.returnTo, environment.publicBaseUrl);
    const stateCookie = signGoogleOAuthState({
      state,
      codeVerifier,
      returnTo,
      expiresAt: Date.now() + googleOAuthStateTtlMs,
    }, stateSigningSecret(environment));
    return {
      stateCookie,
      stateCookieMaxAgeSeconds: googleOAuthStateTtlMs / 1000,
      authorizationUrl: this.googleOAuth.buildAuthorizationUrl({
        clientId: environment.googleOAuthClientId,
        redirectUri: environment.googleOAuthRedirectUri,
        state,
        codeChallenge: sha256Base64url(codeVerifier),
      }),
    };
  }

  async completeGoogleOAuth(input: { code?: string; state?: string; stateCookie?: string }): Promise<{ user: AuthenticatedUser; tokens: TokenPair; returnTo: string }> {
    const environment = this.environmentProvider.read();
    if (!this.googleOAuth || !environment.googleOAuthClientId || !environment.googleOAuthClientSecret || !environment.googleOAuthRedirectUri) {
      throw new BadRequestException('google_oauth_not_configured');
    }
    if (!input.code || !input.state) throw new UnauthorizedException('invalid_google_oauth_state');
    const statePayload = verifyGoogleOAuthState(input.stateCookie, stateSigningSecret(environment));
    if (statePayload.state !== input.state) throw new UnauthorizedException('invalid_google_oauth_state');
    const profile = await this.googleOAuth.authenticate({
      clientId: environment.googleOAuthClientId,
      clientSecret: environment.googleOAuthClientSecret,
      redirectUri: environment.googleOAuthRedirectUri,
      code: input.code,
      codeVerifier: statePayload.codeVerifier,
    });
    const user = await this.findOrCreateGoogleUser(profile);
    return { user: toAuthenticatedUser(user), tokens: this.issueTokens(user), returnTo: statePayload.returnTo };
  }

  googleOAuthErrorReturnTo(input: { state?: string; stateCookie?: string; errorCode: string; fallback?: string }): string {
    const environment = this.environmentProvider.read();
    try {
      const statePayload = verifyGoogleOAuthState(input.stateCookie, stateSigningSecret(environment));
      if (input.state && statePayload.state !== input.state) throw new UnauthorizedException('invalid_google_oauth_state');
      return appendQueryParam(statePayload.returnTo, 'error', input.errorCode);
    } catch {
      return appendQueryParam(normalizeReturnTo(input.fallback || '/auth', environment.publicBaseUrl), 'error', input.errorCode);
    }
  }

  async refresh(refreshToken: string): Promise<{ user: AuthenticatedUser; tokens: TokenPair }> {
    const environment = this.environmentProvider.read();
    const payload = verifyJwt(refreshToken, environment.jwtRefreshSecret, JwtTokenType.Refresh);
    const user = await this.users.findUserById(payload.sub);
    if (!user) throw new UnauthorizedException('user_not_found');
    return { user: toAuthenticatedUser(user), tokens: this.issueTokens(user) };
  }

  async authenticateAccessToken(accessToken: string | undefined): Promise<AuthenticatedUser> {
    if (!accessToken) throw new UnauthorizedException('missing_access_token');
    const environment = this.environmentProvider.read();
    const payload = verifyJwt(accessToken, environment.jwtAccessSecret, JwtTokenType.Access);
    const user = await this.users.findUserById(payload.sub);
    if (!user) throw new UnauthorizedException('user_not_found');
    return toAuthenticatedUser(user);
  }

  async uploadAvatar(input: { userId: string; buffer: Buffer; mimeType: string; sizeBytes: number }): Promise<AuthenticatedUser> {
    const user = await this.users.findUserById(input.userId);
    if (!user) throw new UnauthorizedException('user_not_found');
    if (!avatarMimeTypes.has(input.mimeType)) throw new BadRequestException('unsupported_avatar_type');
    if (!input.buffer.length || input.sizeBytes <= 0) throw new BadRequestException('avatar_file_required');
    if (input.sizeBytes > avatarMaxSizeBytes || input.buffer.length > avatarMaxSizeBytes) throw new BadRequestException('avatar_file_too_large');

    const storage = requireAvatarStorage(this.objectStorage);
    const previousStorageKey = user.avatar || null;
    const storageKey = avatarStorageKey(user.id, input.mimeType);
    await storage.put({ key: storageKey, body: input.buffer, contentType: input.mimeType });
    await getStoredAvatarWithRetry(storage, storageKey);
    const updated = await this.users.updateUserAvatar({
      userId: user.id,
      storageKey,
      mimeType: input.mimeType,
      sizeBytes: input.sizeBytes,
    });
    if (!updated) throw new UnauthorizedException('user_not_found');
    if (previousStorageKey && previousStorageKey !== storageKey) {
      await storage.delete(previousStorageKey).catch(() => undefined);
    }
    return toAuthenticatedUser(updated);
  }

  async deleteAvatar(userId: string): Promise<AuthenticatedUser> {
    const user = await this.users.findUserById(userId);
    if (!user) throw new UnauthorizedException('user_not_found');
    const updated = await this.users.clearUserAvatar(user.id);
    if (!updated) throw new UnauthorizedException('user_not_found');
    if (user.avatar) {
      await requireAvatarStorage(this.objectStorage).delete(user.avatar).catch(() => undefined);
    }
    return toAuthenticatedUser(updated);
  }

  async getAvatarContent(userId: string): Promise<AvatarContent> {
    const user = await this.users.findUserById(userId);
    if (!user) throw new UnauthorizedException('user_not_found');
    if (!user.avatar) throw new NotFoundException('avatar_not_found');
    try {
      const body = await getStoredAvatarWithRetry(requireAvatarStorage(this.objectStorage), user.avatar);
      // Infer mime type from storage key extension
      const extension = user.avatar.split('.').pop()?.toLowerCase() || 'png';
      const mimeTypeMap: Record<string, string> = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp' };
      const mimeType = mimeTypeMap[extension] || 'image/png';
      return { body, mimeType };
    } catch (error) {
      if (error instanceof ObjectStorageMissingContentError) throw new NotFoundException('avatar_not_found');
      throw error;
    }
  }

  issueTokens(user: KbUser): TokenPair {
    const environment = this.environmentProvider.read();
    return {
      accessToken: signJwt({ sub: user.id, email: user.email, role: user.role, typ: JwtTokenType.Access }, environment.jwtAccessSecret, environment.accessTokenTtlSeconds),
      refreshToken: signJwt({ sub: user.id, email: user.email, role: user.role, typ: JwtTokenType.Refresh }, environment.jwtRefreshSecret, environment.refreshTokenTtlSeconds),
      accessTokenMaxAgeSeconds: environment.accessTokenTtlSeconds,
      refreshTokenMaxAgeSeconds: environment.refreshTokenTtlSeconds,
    };
  }

  generateConnectionToken(user: AuthenticatedUser): string {
    const environment = this.environmentProvider.read();
    const token = signJwt(
      { sub: user.id, email: user.email, role: user.role, typ: JwtTokenType.Connection },
      environment.jwtAccessSecret,
      600, // 10 minutes TTL
    );
    return `kbc_${token}`;
  }

  async exchangeConnectionToken(connectionToken: string): Promise<TokenPair> {
    const trimmed = String(connectionToken || '').trim();
    if (!trimmed.startsWith('kbc_')) {
      throw new UnauthorizedException('invalid_connection_token');
    }
    const token = trimmed.slice(4);
    const environment = this.environmentProvider.read();
    const payload = verifyJwt(token, environment.jwtAccessSecret, JwtTokenType.Connection);
    const user = await this.users.findUserById(payload.sub);
    if (!user) throw new UnauthorizedException('user_not_found');
    return this.issueTokens(user);
  }

  private async findOrCreateGoogleUser(profile: GoogleOAuthProfile): Promise<KbUser> {
    if (!profile.email || !profile.emailVerified) throw new UnauthorizedException('google_email_not_verified');
    const identity = await this.users.findAuthIdentity(googleAuthProvider, profile.providerUserId);
    if (identity) {
      const user = await this.users.findUserById(identity.userId);
      if (!user) throw new UnauthorizedException('user_not_found');
      return user;
    }
    const existing = await this.users.findUserByEmail(profile.email);
    if (existing) {
      const existingGoogleIdentity = await this.users.findUserAuthIdentity(existing.id, googleAuthProvider);
      if (existingGoogleIdentity) return existing;
      throw new ConflictException({
        code: 'email_already_registered',
        details: { fieldErrors: { email: 'This email is already registered. Sign in with your password before linking Google.' } },
      });
    }
    const user = await this.users.createUser({
      email: profile.email,
      displayName: profile.displayName,
      passwordHash: null,
      role: 'user',
    });
    await this.users.createAuthIdentity({
      provider: googleAuthProvider,
      providerUserId: profile.providerUserId,
      userId: user.id,
      email: profile.email,
      emailVerified: profile.emailVerified,
      displayName: profile.displayName,
      metadata: { pictureUrl: profile.pictureUrl },
    });
    return user;
  }
}
