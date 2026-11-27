import { Module } from '@nestjs/common';
import { LoggerModule } from './logger.module.js';
import { EnvModule } from './env.module.js';
import { DatabaseModule } from './database.module.js';
import { StorageModule } from './storage.module.js';

import { AuthService } from '../../application/services/auth/auth.service.js';
import { JwtService } from '../../application/services/auth/jwt.service.js';
import { PasswordService } from '../../application/services/auth/password.service.js';
import { GoogleOAuthService } from '../../application/services/integrations/google-oauth.service.js';
import { AvatarService } from '../../application/services/content/avatar.service.js';
import { GoogleOAuthGateway } from '../../application/ports/auth/google-oauth.gateway.js';
import { GoogleAuthLibraryOAuthGateway } from '../auth/google-oauth.gateway.js';

import {
  AccessTokenAuthGuard,
  AuthRateLimitGuard,
  BrowserExtensionGuard,
  GlobalRateLimitGuard,
  TrustedOriginGuard,
  InternalServiceTokenGuard,
  WebhookRateLimitGuard,
} from '../../interfaces/http/guards/auth.guards.js';
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
    JwtService,
    PasswordService,
    GoogleOAuthService,
    AvatarService,
    AuthService,
    AccessTokenAuthGuard,
    AuthRateLimitGuard,
    BrowserExtensionGuard,
    GlobalRateLimitGuard,
    TrustedOriginGuard,
    InternalServiceTokenGuard,
    WebhookRateLimitGuard,
    GoogleAuthLibraryOAuthGateway,
    { provide: GoogleOAuthGateway, useExisting: GoogleAuthLibraryOAuthGateway },
  ],
  exports: [
    JwtService,
    PasswordService,
    GoogleOAuthService,
    AvatarService,
    AuthService,
    AccessTokenAuthGuard,
    AuthRateLimitGuard,
    BrowserExtensionGuard,
    GlobalRateLimitGuard,
    TrustedOriginGuard,
    InternalServiceTokenGuard,
    WebhookRateLimitGuard,
  ],
})
export class AuthModule {}
