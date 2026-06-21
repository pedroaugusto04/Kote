import { Module } from '@nestjs/common';
import { LoggerModule } from './logger.module.js';
import { EnvModule } from './env.module.js';
import { DatabaseModule } from './database.module.js';
import { StorageModule } from './storage.module.js';

import { AuthService } from '../../application/auth.js';
import { SchemaMigrator, UserRepository } from '../../application/ports/auth/auth.repository.js';
import { GoogleOAuthGateway } from '../../application/ports/auth/google-oauth.gateway.js';
import { GoogleAuthLibraryOAuthGateway } from '../auth/google-oauth.gateway.js';

import {
  AccessTokenAuthGuard,
  AuthRateLimitGuard,
  GlobalRateLimitGuard,
  TrustedOriginGuard,
  InternalServiceTokenGuard,
  WebhookRateLimitGuard,
} from '../../interfaces/http/auth.guards.js';
import { AuthController } from '../../interfaces/http/controllers/index.js';

@Module({
  imports: [
    LoggerModule,
    EnvModule,
    DatabaseModule,
    StorageModule,
  ],
  controllers: [
    AuthController,
  ],
  providers: [
    AuthService,
    AccessTokenAuthGuard,
    AuthRateLimitGuard,
    GlobalRateLimitGuard,
    TrustedOriginGuard,
    InternalServiceTokenGuard,
    WebhookRateLimitGuard,
    GoogleAuthLibraryOAuthGateway,
    { provide: GoogleOAuthGateway, useExisting: GoogleAuthLibraryOAuthGateway },
  ],
  exports: [
    AuthService,
    AccessTokenAuthGuard,
    AuthRateLimitGuard,
    GlobalRateLimitGuard,
    TrustedOriginGuard,
    InternalServiceTokenGuard,
    WebhookRateLimitGuard,
    UserRepository,
  ],
})
export class AuthModule {}
