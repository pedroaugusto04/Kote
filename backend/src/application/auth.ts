import { BadRequestException, ConflictException, Injectable, NotFoundException, OnModuleInit, UnauthorizedException } from '@nestjs/common';

import type { KbUser } from './models/repository-records.models.js';
import { GoogleOAuthGateway, type GoogleOAuthProfile } from './ports/auth/google-oauth.gateway.js';
import { WelcomeEmailService } from './use-cases/welcome-email.use-case.js';
import { ObjectStorage } from './ports/notes/object-storage.js';
import { SchemaMigrator, UserRepository } from './ports/auth/auth.repository.js';
import { RuntimeEnvironmentProvider } from './ports/observability/runtime-environment.port.js';
import { readEnvironment } from '../adapters/environment.js';
import { BILLING_ERROR_MESSAGES } from '../domain/constants/billing.constants.js';
import { JwtService, type TokenPair } from './services/jwt.service.js';
import { PasswordService } from './services/password.service.js';
import { GoogleOAuthService } from './services/google-oauth.service.js';
import { AvatarService, type AvatarContent, avatarMaxSizeBytes } from './services/avatar.service.js';

export type AuthenticatedUser = {
  id: string;
  email: string;
  displayName: string;
  role: string;
  avatarUrl: string | null;
  vsCodeInstalledAt: string | null;
};

export type { AvatarContent, TokenPair };
export { avatarMaxSizeBytes };

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
  const timestamp = user.updatedAt ? new Date(user.updatedAt).getTime() : Date.now();
  return {
    id: user.id,
    email: user.email,
    displayName: user.displayName,
    role: user.role,
    avatarUrl: user.avatar ? `/api/auth/avatar/content?t=${timestamp}` : null,
    vsCodeInstalledAt: user.vsCodeInstalledAt ?? null,
  };
}


@Injectable()
export class AuthService implements OnModuleInit {
  private jwtService: JwtService;
  private passwordService: PasswordService;
  private googleOAuthService?: GoogleOAuthService;
  private avatarService?: AvatarService;

  constructor(
    private readonly users: UserRepository,
    private readonly schemaMigrator: SchemaMigrator,
    private readonly environmentProvider: RuntimeEnvironmentProvider = { read: () => readEnvironment() },
    private readonly googleOAuth?: GoogleOAuthGateway,
    private readonly objectStorage?: ObjectStorage,
    private readonly welcomeEmail?: WelcomeEmailService,
  ) {
    const environment = this.environmentProvider.read();
    this.jwtService = new JwtService(
      environment.jwtAccessSecret,
      environment.jwtRefreshSecret,
      environment.accessTokenTtlSeconds,
      environment.refreshTokenTtlSeconds,
    );
    this.passwordService = new PasswordService();
    if (this.googleOAuth) {
      this.googleOAuthService = new GoogleOAuthService(this.googleOAuth, this.environmentProvider);
    }
    if (this.objectStorage) {
      this.avatarService = new AvatarService(this.objectStorage, this.environmentProvider);
    }
  }

  async onModuleInit() {
    await this.schemaMigrator.migrate();
    const environment = this.environmentProvider.read();
    if (!environment.adminEmail || !environment.adminPassword) return;
    const existing = await this.users.findUserByEmail(environment.adminEmail);
    if (existing) return;
    await this.users.createUser({
      email: environment.adminEmail,
      displayName: 'Admin',
      passwordHash: await this.passwordService.hashPassword(environment.adminPassword),
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
      passwordHash: await this.passwordService.hashPassword(password),
      role: 'user',
    });
    // Fire-and-forget welcome email (keeps signup fast and non-blocking)
    if (this.welcomeEmail) {
      this.welcomeEmail.sendWelcomeEmail(user).catch(() => undefined);
    }
    return { user: toAuthenticatedUser(user), tokens: this.jwtService.issueTokens(user) };
  }

  async login(email: string, password: string): Promise<{ user: AuthenticatedUser; tokens: TokenPair }> {
    const user = await this.users.findUserByEmail(String(email || '').trim().toLowerCase());
    if (!user?.passwordHash || !(await this.passwordService.verifyPassword(password, user.passwordHash))) {
      throw new UnauthorizedException('invalid_credentials');
    }
    return { user: toAuthenticatedUser(user), tokens: this.jwtService.issueTokens(user) };
  }

  startGoogleOAuth(input: { returnTo?: string; redirectUri?: string }): { authorizationUrl: string; stateCookie: string; stateCookieMaxAgeSeconds: number } {
    if (!this.googleOAuthService) {
      throw new BadRequestException('google_oauth_not_configured');
    }
    return this.googleOAuthService.startGoogleOAuth(input);
  }

  async completeGoogleOAuth(input: { code?: string; state?: string; stateCookie?: string }): Promise<{ user: AuthenticatedUser; tokens: TokenPair; returnTo: string }> {
    if (!this.googleOAuthService) {
      throw new BadRequestException('google_oauth_not_configured');
    }
    const { profile, returnTo } = await this.googleOAuthService.completeGoogleOAuth(input);
    const user = await this.findOrCreateGoogleUser(profile);
    return { user: toAuthenticatedUser(user), tokens: this.jwtService.issueTokens(user), returnTo };
  }

  googleOAuthErrorReturnTo(input: { state?: string; stateCookie?: string; errorCode: string; fallback?: string }): string {
    if (!this.googleOAuthService) {
      throw new BadRequestException('google_oauth_not_configured');
    }
    return this.googleOAuthService.googleOAuthErrorReturnTo(input);
  }

  async refresh(refreshToken: string): Promise<{ user: AuthenticatedUser; tokens: TokenPair }> {
    const payload = this.jwtService.verifyRefreshToken(refreshToken);
    const user = await this.users.findUserById(payload.sub);
    if (!user) throw new UnauthorizedException('user_not_found');
    return { user: toAuthenticatedUser(user), tokens: this.jwtService.issueTokens(user) };
  }

  async authenticateAccessToken(accessToken: string | undefined): Promise<AuthenticatedUser> {
    if (!accessToken) throw new UnauthorizedException('missing_access_token');
    const payload = this.jwtService.verifyAccessToken(accessToken);
    const user = await this.users.findUserById(payload.sub);
    if (!user) throw new UnauthorizedException('user_not_found');
    return toAuthenticatedUser(user);
  }

  async uploadAvatar(input: { userId: string; buffer: Buffer; mimeType: string; sizeBytes: number }): Promise<AuthenticatedUser> {
    const user = await this.users.findUserById(input.userId);
    if (!user) throw new UnauthorizedException('user_not_found');
    if (!this.avatarService) {
      throw new Error('avatar_storage_not_configured');
    }
    const { storageKey, mimeType, sizeBytes } = await this.avatarService.uploadAvatar({
      userId: input.userId,
      buffer: input.buffer,
      mimeType: input.mimeType,
      sizeBytes: input.sizeBytes,
      previousStorageKey: user.avatar || null,
    });
    const updated = await this.users.updateUserAvatar({
      userId: user.id,
      storageKey,
      mimeType,
      sizeBytes,
    });
    if (!updated) throw new UnauthorizedException('user_not_found');
    return toAuthenticatedUser(updated);
  }

  async deleteAvatar(userId: string): Promise<AuthenticatedUser> {
    const user = await this.users.findUserById(userId);
    if (!user) throw new UnauthorizedException('user_not_found');
    const updated = await this.users.clearUserAvatar(user.id);
    if (!updated) throw new UnauthorizedException('user_not_found');
    if (this.avatarService) {
      await this.avatarService.deleteAvatar(user.avatar);
    }
    return toAuthenticatedUser(updated);
  }

  async updateProfile(userId: string, input: { displayName?: string; cpfCnpj?: string }): Promise<AuthenticatedUser> {
    const user = await this.users.findUserById(userId);
    if (!user) throw new UnauthorizedException(BILLING_ERROR_MESSAGES.USER_NOT_FOUND);
    
    const updated = await this.users.updateUser({
      userId,
      displayName: input.displayName,
      cpfCnpj: input.cpfCnpj,
    });
    
    if (!updated) throw new UnauthorizedException(BILLING_ERROR_MESSAGES.USER_NOT_FOUND);
    return toAuthenticatedUser(updated);
  }

  async getAvatarContent(userId: string): Promise<AvatarContent> {
    const user = await this.users.findUserById(userId);
    if (!user) throw new UnauthorizedException('user_not_found');
    if (!user.avatar) throw new NotFoundException('avatar_not_found');
    if (!this.avatarService) {
      throw new Error('avatar_storage_not_configured');
    }
    return this.avatarService.getAvatarContent(user.avatar);
  }

  generateConnectionToken(user: AuthenticatedUser): string {
    return this.jwtService.generateConnectionToken(user);
  }

  async exchangeConnectionToken(connectionToken: string): Promise<TokenPair> {
    const payload = this.jwtService.verifyConnectionToken(connectionToken);
    const user = await this.users.findUserById(payload.sub);
    if (!user) throw new UnauthorizedException('user_not_found');
    return this.jwtService.issueTokens(user);
  }

  private async findOrCreateGoogleUser(profile: GoogleOAuthProfile): Promise<KbUser> {
    if (!profile.email || !profile.emailVerified) throw new UnauthorizedException('google_email_not_verified');
    const provider = this.googleOAuthService?.getProvider() || 'google';
    const identity = await this.users.findAuthIdentity(provider, profile.providerUserId);
    if (identity) {
      const user = await this.users.findUserById(identity.userId);
      if (!user) throw new UnauthorizedException('user_not_found');
      return user;
    }
    const existing = await this.users.findUserByEmail(profile.email);
    if (existing) {
      const existingGoogleIdentity = await this.users.findUserAuthIdentity(existing.id, provider);
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
      provider,
      providerUserId: profile.providerUserId,
      userId: user.id,
      email: profile.email,
      emailVerified: profile.emailVerified,
      displayName: profile.displayName,
      metadata: { pictureUrl: profile.pictureUrl },
    });
    return user;
  }

  async markVscodeInstalled(userId: string): Promise<void> {
    await this.users.markVscodeInstalled(userId);
  }
}
