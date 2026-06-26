import { CanActivate, ExecutionContext, ForbiddenException, HttpException, HttpStatus, Injectable, UnauthorizedException } from '@nestjs/common';
import type { Request } from 'express';

import { readEnvironment } from '../../adapters/environment.js';
import { AuthService } from '../../application/auth.js';
import type { AuthenticatedRequest } from './auth.decorators.js';
import { accessTokenFromRequest, assertTrustedBrowserOrigin } from './http-security.js';
import { requestIp } from './request-ip.js';

type RateLimitBucket = {
  resetAt: number;
  count: number;
};

const rateLimitBuckets = new Map<string, RateLimitBucket>();

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
export class BrowserExtensionGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const originOrReferer = request.headers.origin || request.headers.referer;

    if (!originOrReferer) {
      return true;
    }

    const originString = String(originOrReferer);

    // Validate chrome-extension:// origins first (URL parsing doesn't work with chrome-extension://)
    if (originString.startsWith('chrome-extension://')) {
      const extensionId = originString.replace('chrome-extension://', '');
      const environment = readEnvironment();
      const allowedIds = environment.allowedExtensionIds;

      // Allow if no IDs are configured (backward compatibility)
      if (allowedIds.length === 0) {
        return true;
      }

      // Allow if ID is in the allowed list
      if (allowedIds.includes(extensionId)) {
        return true;
      }

      throw new ForbiddenException('invalid_origin');
    }

    // Validate web origins
    const actualOrigin = new URL(originString).origin;
    const environment = readEnvironment();
    const allowedOrigins = new Set<string>();
    for (const origin of environment.allowedOrigins) {
      allowedOrigins.add(new URL(origin).origin);
    }
    if (environment.publicBaseUrl) {
      allowedOrigins.add(new URL(environment.publicBaseUrl).origin);
    }

    if (!allowedOrigins.has(actualOrigin)) {
      throw new ForbiddenException('invalid_origin');
    }

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
