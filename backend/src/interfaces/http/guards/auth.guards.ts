import { CanActivate, ExecutionContext, ForbiddenException, HttpException, HttpStatus, Injectable, UnauthorizedException } from '@nestjs/common';
import type { Request } from 'express';

import { readEnvironment } from '../../../adapters/environment.js';
import { AuthService } from '../../../application/auth.js';
import type { AuthenticatedRequest } from '../auth.decorators.js';
import { accessTokenFromRequest, assertTrustedBrowserOrigin } from '../http-security.js';
import { requestIp } from '../request-ip.js';
import { AUTH_ERROR_MESSAGES, AUTH_HEADERS, RATE_LIMIT_CONFIG, RATE_LIMIT_NAMESPACES } from './auth-guards.constants.js';

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
  if (current.count > limit) throw new HttpException(AUTH_ERROR_MESSAGES.RATE_LIMITED, HttpStatus.TOO_MANY_REQUESTS);
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
    if (originString.startsWith(AUTH_HEADERS.CHROME_EXTENSION_PREFIX)) {
      const extensionId = originString.replace(AUTH_HEADERS.CHROME_EXTENSION_PREFIX, '');
      const environment = readEnvironment();
      const allowedIds = environment.allowedExtensionIds;

      // Allow if ID is in the allowed list
      if (allowedIds.includes(extensionId)) {
        return true;
      }

      throw new ForbiddenException(AUTH_ERROR_MESSAGES.INVALID_ORIGIN);
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
      throw new ForbiddenException(AUTH_ERROR_MESSAGES.INVALID_ORIGIN);
    }

    return true;
  }
}

@Injectable()
export class InternalServiceTokenGuard implements CanActivate { 
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const authorization = request.headers.authorization || '';
    const token = String(authorization).startsWith(AUTH_HEADERS.BEARER_PREFIX) ? String(authorization).slice(AUTH_HEADERS.BEARER_PREFIX.length) : '';
    if (!readEnvironment().internalServiceToken || token !== readEnvironment().internalServiceToken) {
      throw new UnauthorizedException(AUTH_ERROR_MESSAGES.INVALID_INTERNAL_TOKEN); 
    }
    return true;
  }
}

@Injectable()
export class AuthRateLimitGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    assertRateLimit(
      context.switchToHttp().getRequest<Request>(),
      RATE_LIMIT_NAMESPACES.AUTH,
      RATE_LIMIT_CONFIG.AUTH.limit,
      RATE_LIMIT_CONFIG.AUTH.windowMs,
    );
    return true;
  }
}

@Injectable()
export class GlobalRateLimitGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    assertRateLimit(
      context.switchToHttp().getRequest<Request>(),
      RATE_LIMIT_NAMESPACES.GLOBAL,
      RATE_LIMIT_CONFIG.GLOBAL.limit,
      RATE_LIMIT_CONFIG.GLOBAL.windowMs,
    );
    return true;
  }
}

@Injectable()
export class WebhookRateLimitGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    assertRateLimit(
      context.switchToHttp().getRequest<Request>(),
      RATE_LIMIT_NAMESPACES.WEBHOOK,
      RATE_LIMIT_CONFIG.WEBHOOK.limit,
      RATE_LIMIT_CONFIG.WEBHOOK.windowMs,
    );
    return true;
  }
}
