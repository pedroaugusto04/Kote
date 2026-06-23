import { Module } from '@nestjs/common';
import { LoggerModule } from './logger.module.js';
import { EnvModule } from './env.module.js';
import { DatabaseModule } from './database.module.js';
import { StorageModule } from './storage.module.js';

import { AuthService } from '../../application/auth.js';
import { WelcomeEmailService } from '../../application/use-cases/welcome-email.use-case.js';
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
import { EmailModule } from './email.module.js';

@Module({
  imports: [
    LoggerModule,
    EnvModule,
    DatabaseModule,
    StorageModule,
    EmailModule,
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
    WelcomeEmailService,
  ],
  exports: [
    AuthService,
    AccessTokenAuthGuard,
    AuthRateLimitGuard,
    GlobalRateLimitGuard,
    TrustedOriginGuard,
    InternalServiceTokenGuard,
    WebhookRateLimitGuard,
    DatabaseModule,
  ],
})
export class AuthModule {}
