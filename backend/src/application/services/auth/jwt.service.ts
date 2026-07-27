import crypto from 'node:crypto';

import { Injectable, UnauthorizedException } from '@nestjs/common';

import { JwtTokenType } from '../../../contracts/enums.js';

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
  constructor(
    private readonly accessSecret: string,
    private readonly refreshSecret: string,
    private readonly accessTokenTtlSeconds: number,
    private readonly refreshTokenTtlSeconds: number,
  ) {}

  private base64url(input: Buffer | string): string {
    return Buffer.from(input).toString('base64url');
  }

  private parseBase64urlJson(value: string): unknown {
    return JSON.parse(Buffer.from(value, 'base64url').toString('utf8')) as unknown;
  }

  signJwt(payload: Omit<JwtPayload, 'iat' | 'exp'>, secret: string, ttlSeconds: number): string {
    if (!secret) throw new Error('jwt_secret_not_configured');
    const issuedAt = Math.floor(Date.now() / 1000);
    const header = { alg: 'HS256', typ: 'JWT' };
    const body: JwtPayload = { ...payload, iat: issuedAt, exp: issuedAt + ttlSeconds };
    const signingInput = `${this.base64url(JSON.stringify(header))}.${this.base64url(JSON.stringify(body))}`;
    const signature = crypto.createHmac('sha256', secret).update(signingInput).digest('base64url');
    return `${signingInput}.${signature}`;
  }

  verifyJwt(token: string, secret: string, expectedType: JwtPayload['typ']): JwtPayload {
    if (!secret) throw new UnauthorizedException('jwt_secret_not_configured');
    const [encodedHeader, encodedPayload, signature] = token.split('.');
    if (!encodedHeader || !encodedPayload || !signature) throw new UnauthorizedException('invalid_token');
    const signingInput = `${encodedHeader}.${encodedPayload}`;
    const expected = crypto.createHmac('sha256', secret).update(signingInput).digest('base64url');
    if (signature.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) {
      throw new UnauthorizedException('invalid_token');
    }
    const payload = this.parseBase64urlJson(encodedPayload) as JwtPayload;
    if (payload.typ !== expectedType) throw new UnauthorizedException('invalid_token_type');
    if (!payload.sub || !payload.email || !payload.role || !payload.exp) throw new UnauthorizedException('invalid_token');
    if (payload.exp <= Math.floor(Date.now() / 1000)) throw new UnauthorizedException('token_expired');
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
      throw new UnauthorizedException('invalid_connection_token');
    }
    const token = trimmed.slice(4);
    return this.verifyJwt(token, this.accessSecret, JwtTokenType.Connection);
  }
}
