import { CanActivate, ExecutionContext, HttpException, HttpStatus, Injectable, UnauthorizedException } from '@nestjs/common';
import type { Request } from 'express';

import { readEnvironment } from '../../adapters/environment.js';
import { AuthService } from '../../application/auth.js';
import type { AuthenticatedRequest } from './auth.decorators.js';
import { accessTokenFromRequest, assertTrustedBrowserOrigin } from './http-security.js';

type RateLimitBucket = {
  resetAt: number;
  count: number;
};

const rateLimitBuckets = new Map<string, RateLimitBucket>();

function requestIp(request: Request): string {
  const forwardedFor = String(request.headers['x-forwarded-for'] || '').split(',')[0].trim();
  return forwardedFor || request.ip || request.socket.remoteAddress || 'unknown';
}

function assertRateLimit(request: Request, namespace: string, limit: number, windowMs: number) {
  const now = Date.now();
  const key = `${namespace}:${requestIp(request)}`;
  const current = rateLimitBuckets.get(key);
  if (!current || current.resetAt <= now) {
    rateLimitBuckets.set(key, { resetAt: now + windowMs, count: 1 });
    return;
  }
  current.count += 1;
  if (current.count > limit) throw new HttpException('rate_limited', HttpStatus.TOO_MANY_REQUESTS);
}

@Injectable()
export class AccessTokenAuthGuard implements CanActivate {
  constructor(private readonly auth: AuthService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    request.user = await this.auth.authenticateAccessToken(accessTokenFromRequest(request));
    return true;
  }
}

@Injectable()
export class TrustedOriginGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    assertTrustedBrowserOrigin(context.switchToHttp().getRequest<Request>());
    return true;
  }
}

@Injectable()
export class InternalServiceTokenGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const authorization = request.headers.authorization || '';
    const token = String(authorization).startsWith('Bearer ') ? String(authorization).slice('Bearer '.length) : '';
    if (!readEnvironment().internalServiceToken || token !== readEnvironment().internalServiceToken) {
      throw new UnauthorizedException('invalid_internal_token');
    }
    return true;
  }
}

@Injectable()
export class AuthRateLimitGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    assertRateLimit(context.switchToHttp().getRequest<Request>(), 'auth', 10, 60_000);
    return true;
  }
}

@Injectable()
export class GlobalRateLimitGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    assertRateLimit(context.switchToHttp().getRequest<Request>(), 'global', 300, 60_000);
    return true;
  }
}

@Injectable()
export class WebhookRateLimitGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    assertRateLimit(context.switchToHttp().getRequest<Request>(), 'webhook', 60, 60_000);
    return true;
  }
}
