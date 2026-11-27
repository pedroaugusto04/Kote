import crypto from 'node:crypto';

import { Injectable } from '@nestjs/common';

import {
  AppErrorCode,
  GoogleOAuthException,
  GoogleOAuthNotConfiguredException,
  JwtSecretNotConfiguredException,
  ReturnToPathMustBeRelativeException,
} from '../../../domain/exceptions/index.js';

import {
  decodeBase64UrlJson,
  encodeBase64Url,
  hmacSha256Base64Url,
  sha256Base64Url,
  timingSafeEquals,
} from '../../../domain/utils/crypto.utils.js';
import { GoogleOAuthGateway, type GoogleOAuthProfile } from '../../ports/auth/google-oauth.gateway.js';
import { RuntimeEnvironmentProvider } from '../../ports/observability/runtime-environment.port.js';

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

  private sha256Base64url(value: string): string {
    return sha256Base64Url(value);
  }

  private stateSigningSecret(environment: { jwtAccessSecret: string; jwtRefreshSecret: string }): string {
    return environment.jwtAccessSecret || environment.jwtRefreshSecret;
  }

  private signGoogleOAuthState(payload: GoogleOAuthStatePayload, secret: string): string {
    if (!secret) throw new JwtSecretNotConfiguredException();
    const encoded = encodeBase64Url(JSON.stringify(payload));
    const signature = hmacSha256Base64Url(encoded, secret);
    return `${encoded}.${signature}`;
  }

  private verifyGoogleOAuthState(cookieValue: string | undefined, secret: string): GoogleOAuthStatePayload {
    if (!secret) throw new JwtSecretNotConfiguredException();
    if (!cookieValue) throw new GoogleOAuthException(AppErrorCode.InvalidGoogleOAuthState);
    const [encoded, signature] = cookieValue.split('.');
    if (!encoded || !signature) throw new GoogleOAuthException(AppErrorCode.InvalidGoogleOAuthState);
    const expected = hmacSha256Base64Url(encoded, secret);
    if (!timingSafeEquals(signature, expected)) {
      throw new GoogleOAuthException(AppErrorCode.InvalidGoogleOAuthState);
    }
    const payload = decodeBase64UrlJson(encoded) as GoogleOAuthStatePayload;
    if (!payload.state || !payload.codeVerifier || !payload.returnTo || !payload.redirectUri || !payload.expiresAt) {
      throw new GoogleOAuthException(AppErrorCode.InvalidGoogleOAuthState);
    }
    if (payload.expiresAt <= Date.now()) throw new GoogleOAuthException(AppErrorCode.InvalidGoogleOAuthState);
    return payload;
  }

  private normalizeReturnTo(value: string | undefined, publicBaseUrl?: string): string {
    let trimmed = value?.trim() || '/';
    if (!trimmed.startsWith('/') || trimmed.startsWith('//') || trimmed.includes('\\')) {
      throw new ReturnToPathMustBeRelativeException();
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
      throw new GoogleOAuthNotConfiguredException(AppErrorCode.GoogleOAuthNotConfigured);
    }
    const redirectUri = input.redirectUri || environment.googleOAuthRedirectUri;
    if (!redirectUri) {
      throw new GoogleOAuthNotConfiguredException(AppErrorCode.GoogleOAuthRedirectUriNotConfigured);
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
      throw new GoogleOAuthNotConfiguredException(AppErrorCode.GoogleOAuthNotConfigured);
    }
    if (!input.code || !input.state) throw new GoogleOAuthException(AppErrorCode.InvalidGoogleOAuthState);
    const statePayload = this.verifyGoogleOAuthState(input.stateCookie, this.stateSigningSecret(environment));
    if (statePayload.state !== input.state) throw new GoogleOAuthException(AppErrorCode.InvalidGoogleOAuthState);
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
      if (input.state && statePayload.state !== input.state) throw new GoogleOAuthException(AppErrorCode.InvalidGoogleOAuthState);
      return this.appendQueryParam(statePayload.returnTo, 'error', input.errorCode);
    } catch {
      return this.appendQueryParam(this.normalizeReturnTo(input.fallback || '/auth', environment.publicBaseUrl), 'error', input.errorCode);
    }
  }

  getProvider(): string {
    return googleAuthProvider;
  }
}
