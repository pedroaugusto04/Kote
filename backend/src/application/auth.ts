import crypto from 'node:crypto';
import { promisify } from 'node:util';

import { BadRequestException, ConflictException, Injectable, OnModuleInit, UnauthorizedException } from '@nestjs/common';

import type { KbUser } from './models/repository-records.models.js';
import { GoogleOAuthGateway, type GoogleOAuthProfile } from './ports/google-oauth.gateway.js';
import { SchemaMigrator, UserRepository } from './ports/auth.repository.js';
import { RuntimeEnvironmentProvider } from './ports/runtime-environment.port.js';
import { readEnvironment } from '../adapters/environment.js';

const scrypt = promisify(crypto.scrypt);

export type AuthenticatedUser = {
  id: string;
  email: string;
  displayName: string;
  role: string;
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
  typ: 'access' | 'refresh';
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

function normalizeReturnTo(value: string | undefined): string {
  const trimmed = String(value || '/').trim() || '/';
  if (!trimmed.startsWith('/') || trimmed.startsWith('//') || trimmed.includes('\\')) {
    throw new BadRequestException('return_to_path_must_be_relative');
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
  return { id: user.id, email: user.email, displayName: user.displayName, role: user.role };
}

@Injectable()
export class AuthService implements OnModuleInit {
  constructor(
    private readonly users: UserRepository,
    private readonly schemaMigrator: SchemaMigrator,
    private readonly environmentProvider: RuntimeEnvironmentProvider = { read: () => readEnvironment() },
    private readonly googleOAuth?: GoogleOAuthGateway,
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
        details: { fieldErrors: { email: 'Este email ja esta cadastrado.' } },
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
    const returnTo = normalizeReturnTo(input.returnTo);
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
      return appendQueryParam(normalizeReturnTo(input.fallback || '/auth'), 'error', input.errorCode);
    }
  }

  async refresh(refreshToken: string): Promise<{ user: AuthenticatedUser; tokens: TokenPair }> {
    const environment = this.environmentProvider.read();
    const payload = verifyJwt(refreshToken, environment.jwtRefreshSecret, 'refresh');
    const user = await this.users.findUserById(payload.sub);
    if (!user) throw new UnauthorizedException('user_not_found');
    return { user: toAuthenticatedUser(user), tokens: this.issueTokens(user) };
  }

  async authenticateAccessToken(accessToken: string | undefined): Promise<AuthenticatedUser> {
    if (!accessToken) throw new UnauthorizedException('missing_access_token');
    const environment = this.environmentProvider.read();
    const payload = verifyJwt(accessToken, environment.jwtAccessSecret, 'access');
    const user = await this.users.findUserById(payload.sub);
    if (!user) throw new UnauthorizedException('user_not_found');
    return toAuthenticatedUser(user);
  }

  issueTokens(user: KbUser): TokenPair {
    const environment = this.environmentProvider.read();
    return {
      accessToken: signJwt({ sub: user.id, email: user.email, role: user.role, typ: 'access' }, environment.jwtAccessSecret, environment.accessTokenTtlSeconds),
      refreshToken: signJwt({ sub: user.id, email: user.email, role: user.role, typ: 'refresh' }, environment.jwtRefreshSecret, environment.refreshTokenTtlSeconds),
      accessTokenMaxAgeSeconds: environment.accessTokenTtlSeconds,
      refreshTokenMaxAgeSeconds: environment.refreshTokenTtlSeconds,
    };
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
        details: { fieldErrors: { email: 'Este email ja esta cadastrado. Entre com senha e vincule o Google depois.' } },
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

export const passwordHashing = { hashPassword, verifyPassword };
