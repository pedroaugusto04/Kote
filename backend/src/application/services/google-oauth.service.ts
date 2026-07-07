import crypto from 'node:crypto';

import { BadRequestException, Injectable, UnauthorizedException } from '@nestjs/common';

import { GoogleOAuthGateway, type GoogleOAuthProfile } from '../ports/auth/google-oauth.gateway.js';
import { RuntimeEnvironmentProvider } from '../ports/observability/runtime-environment.port.js';

const googleAuthProvider = 'google';
const googleOAuthStateTtlMs = 10 * 60 * 1000;

type GoogleOAuthStatePayload = {
  state: string;
  codeVerifier: string;
  returnTo: string;
  redirectUri: string;
  expiresAt: number;
};

@Injectable()
export class GoogleOAuthService {
  constructor(
    private readonly googleOAuth: GoogleOAuthGateway,
    private readonly environmentProvider: RuntimeEnvironmentProvider,
  ) {}

  private base64url(input: Buffer | string): string {
    return Buffer.from(input).toString('base64url');
  }

  private parseBase64urlJson(value: string): unknown {
    return JSON.parse(Buffer.from(value, 'base64url').toString('utf8')) as unknown;
  }

  private sha256Base64url(value: string): string {
    return crypto.createHash('sha256').update(value).digest('base64url');
  }

  private stateSigningSecret(environment: { jwtAccessSecret: string; jwtRefreshSecret: string }): string {
    return environment.jwtAccessSecret || environment.jwtRefreshSecret;
  }

  private signGoogleOAuthState(payload: GoogleOAuthStatePayload, secret: string): string {
    if (!secret) throw new Error('jwt_secret_not_configured');
    const encoded = this.base64url(JSON.stringify(payload));
    const signature = crypto.createHmac('sha256', secret).update(encoded).digest('base64url');
    return `${encoded}.${signature}`;
  }

  private verifyGoogleOAuthState(cookieValue: string | undefined, secret: string): GoogleOAuthStatePayload {
    if (!secret) throw new Error('jwt_secret_not_configured');
    if (!cookieValue) throw new UnauthorizedException('invalid_google_oauth_state');
    const [encoded, signature] = cookieValue.split('.');
    if (!encoded || !signature) throw new UnauthorizedException('invalid_google_oauth_state');
    const expected = crypto.createHmac('sha256', secret).update(encoded).digest('base64url');
    if (signature.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) {
      throw new UnauthorizedException('invalid_google_oauth_state');
    }
    const payload = this.parseBase64urlJson(encoded) as GoogleOAuthStatePayload;
    if (!payload.state || !payload.codeVerifier || !payload.returnTo || !payload.redirectUri || !payload.expiresAt) {
      throw new UnauthorizedException('invalid_google_oauth_state');
    }
    if (payload.expiresAt <= Date.now()) throw new UnauthorizedException('invalid_google_oauth_state');
    return payload;
  }

  private normalizeReturnTo(value: string | undefined, publicBaseUrl?: string): string {
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

  private appendQueryParam(path: string, key: string, value: string): string {
    const [pathnameWithQuery, hash = ''] = path.split('#', 2);
    const [pathname, query = ''] = pathnameWithQuery.split('?', 2);
    const params = new URLSearchParams(query);
    params.set(key, value);
    const nextQuery = params.toString();
    return `${pathname}${nextQuery ? `?${nextQuery}` : ''}${hash ? `#${hash}` : ''}`;
  }

  startGoogleOAuth(input: { returnTo?: string; redirectUri?: string }): { authorizationUrl: string; stateCookie: string; stateCookieMaxAgeSeconds: number } {
    const environment = this.environmentProvider.read();
    if (!this.googleOAuth || !environment.googleOAuthClientId || !environment.googleOAuthClientSecret) {
      throw new BadRequestException('google_oauth_not_configured');
    }
    const redirectUri = input.redirectUri || environment.googleOAuthRedirectUri;
    if (!redirectUri) {
      throw new BadRequestException('google_oauth_redirect_uri_not_configured');
    }
    const state = crypto.randomBytes(32).toString('base64url');
    const codeVerifier = crypto.randomBytes(64).toString('base64url');
    const returnTo = this.normalizeReturnTo(input.returnTo, environment.publicBaseUrl);
    const stateCookie = this.signGoogleOAuthState(
      {
        state,
        codeVerifier,
        returnTo,
        redirectUri,
        expiresAt: Date.now() + googleOAuthStateTtlMs,
      },
      this.stateSigningSecret(environment),
    );
    return {
      stateCookie,
      stateCookieMaxAgeSeconds: googleOAuthStateTtlMs / 1000,
      authorizationUrl: this.googleOAuth.buildAuthorizationUrl({
        clientId: environment.googleOAuthClientId,
        redirectUri,
        state,
        codeChallenge: this.sha256Base64url(codeVerifier),
      }),
    };
  }

  async completeGoogleOAuth(input: { code?: string; state?: string; stateCookie?: string }): Promise<{ profile: GoogleOAuthProfile; returnTo: string }> {
    const environment = this.environmentProvider.read();
    if (!this.googleOAuth || !environment.googleOAuthClientId || !environment.googleOAuthClientSecret) {
      throw new BadRequestException('google_oauth_not_configured');
    }
    if (!input.code || !input.state) throw new UnauthorizedException('invalid_google_oauth_state');
    const statePayload = this.verifyGoogleOAuthState(input.stateCookie, this.stateSigningSecret(environment));
    if (statePayload.state !== input.state) throw new UnauthorizedException('invalid_google_oauth_state');
    const profile = await this.googleOAuth.authenticate({
      clientId: environment.googleOAuthClientId,
      clientSecret: environment.googleOAuthClientSecret,
      redirectUri: statePayload.redirectUri,
      code: input.code,
      codeVerifier: statePayload.codeVerifier,
    });
    return { profile, returnTo: statePayload.returnTo };
  }

  googleOAuthErrorReturnTo(input: { state?: string; stateCookie?: string; errorCode: string; fallback?: string }): string {
    const environment = this.environmentProvider.read();
    try {
      const statePayload = this.verifyGoogleOAuthState(input.stateCookie, this.stateSigningSecret(environment));
      if (input.state && statePayload.state !== input.state) throw new UnauthorizedException('invalid_google_oauth_state');
      return this.appendQueryParam(statePayload.returnTo, 'error', input.errorCode);
    } catch {
      return this.appendQueryParam(this.normalizeReturnTo(input.fallback || '/auth', environment.publicBaseUrl), 'error', input.errorCode);
    }
  }

  getProvider(): string {
    return googleAuthProvider;
  }
}
