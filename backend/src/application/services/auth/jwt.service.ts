import { Injectable } from '@nestjs/common';

import { JwtTokenType } from '../../../contracts/enums.js';
import {
  AppErrorCode,
  InvalidTokenException,
  JwtSecretNotConfiguredException,
  TokenExpiredException,
} from '../../../domain/exceptions/index.js';
import {
  decodeBase64UrlJson,
  encodeBase64Url,
  hmacSha256Base64Url,
  timingSafeEquals,
} from '../../../domain/utils/crypto.utils.js';
import { RuntimeEnvironmentProvider } from '../../ports/observability/runtime-environment.port.js';

export type JwtPayload = {
  sub: string;
  email: string;
  role: string;
  typ: JwtTokenType;
  iat: number;
  exp: number;
};

export type TokenPair = {
  accessToken: string;
  refreshToken: string;
  accessTokenMaxAgeSeconds: number;
  refreshTokenMaxAgeSeconds: number;
};

@Injectable()
export class JwtService {
  constructor(private readonly environmentProvider: RuntimeEnvironmentProvider) {}

  private get accessSecret(): string {
    return this.environmentProvider.read().jwtAccessSecret;
  }

  private get refreshSecret(): string {
    return this.environmentProvider.read().jwtRefreshSecret;
  }

  private get accessTokenTtlSeconds(): number {
    return this.environmentProvider.read().accessTokenTtlSeconds;
  }

  private get refreshTokenTtlSeconds(): number {
    return this.environmentProvider.read().refreshTokenTtlSeconds;
  }

  signJwt(payload: Omit<JwtPayload, 'iat' | 'exp'>, secret: string, ttlSeconds: number): string {
    if (!secret) throw new JwtSecretNotConfiguredException();
    const issuedAt = Math.floor(Date.now() / 1000);
    const header = { alg: 'HS256', typ: 'JWT' };
    const body: JwtPayload = { ...payload, iat: issuedAt, exp: issuedAt + ttlSeconds };
    const signingInput = `${encodeBase64Url(JSON.stringify(header))}.${encodeBase64Url(JSON.stringify(body))}`;
    const signature = hmacSha256Base64Url(signingInput, secret);
    return `${signingInput}.${signature}`;
  }

  verifyJwt(token: string, secret: string, expectedType: JwtPayload['typ']): JwtPayload {
    if (!secret) throw new JwtSecretNotConfiguredException();
    const [encodedHeader, encodedPayload, signature] = token.split('.');
    if (!encodedHeader || !encodedPayload || !signature) throw new InvalidTokenException();
    const signingInput = `${encodedHeader}.${encodedPayload}`;
    const expected = hmacSha256Base64Url(signingInput, secret);
    if (!timingSafeEquals(signature, expected)) {
      throw new InvalidTokenException();
    }
    const payload = decodeBase64UrlJson(encodedPayload) as JwtPayload;
    if (payload.typ !== expectedType) throw new InvalidTokenException(AppErrorCode.InvalidTokenType);
    if (!payload.sub || !payload.email || !payload.role || !payload.exp) throw new InvalidTokenException();
    if (payload.exp <= Math.floor(Date.now() / 1000)) throw new TokenExpiredException();
    return payload;
  }

  issueTokens(user: { id: string; email: string; role: string }): TokenPair {
    return {
      accessToken: this.signJwt(
        { sub: user.id, email: user.email, role: user.role, typ: JwtTokenType.Access },
        this.accessSecret,
        this.accessTokenTtlSeconds,
      ),
      refreshToken: this.signJwt(
        { sub: user.id, email: user.email, role: user.role, typ: JwtTokenType.Refresh },
        this.refreshSecret,
        this.refreshTokenTtlSeconds,
      ),
      accessTokenMaxAgeSeconds: this.accessTokenTtlSeconds,
      refreshTokenMaxAgeSeconds: this.refreshTokenTtlSeconds,
    };
  }

  generateConnectionToken(user: { id: string; email: string; role: string }, ttlSeconds: number = 600): string {
    const token = this.signJwt(
      { sub: user.id, email: user.email, role: user.role, typ: JwtTokenType.Connection },
      this.accessSecret,
      ttlSeconds,
    );
    return `kbc_${token}`;
  }

  verifyAccessToken(accessToken: string): JwtPayload {
    return this.verifyJwt(accessToken, this.accessSecret, JwtTokenType.Access);
  }

  verifyRefreshToken(refreshToken: string): JwtPayload {
    return this.verifyJwt(refreshToken, this.refreshSecret, JwtTokenType.Refresh);
  }

  verifyConnectionToken(connectionToken: string): JwtPayload {
    const trimmed = String(connectionToken || '').trim();
    if (!trimmed.startsWith('kbc_')) {
      throw new InvalidTokenException(AppErrorCode.InvalidConnectionToken);
    }
    const token = trimmed.slice(4);
    return this.verifyJwt(token, this.accessSecret, JwtTokenType.Connection);
  }
}
