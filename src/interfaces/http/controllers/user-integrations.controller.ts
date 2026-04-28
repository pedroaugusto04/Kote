import { BadRequestException, Body, Controller, Delete, Get, Param, Put, Query, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';

import { AuthService, type AuthenticatedUser } from '../../../application/auth.js';
import { IntegrationCredentialService } from '../../../application/credentials.js';
import { CurrentUser } from '../auth.decorators.js';
import { AccessTokenAuthGuard, TrustedOriginGuard } from '../auth.guards.js';
import {
  parseSaveIntegrationCredentialBody,
  providerParamSchema,
  saveIntegrationCredentialBodySchema,
  workspaceQuerySchema,
  type ProviderParam,
  type SaveIntegrationCredentialBodyInput,
  type WorkspaceQuery,
} from '../dto/integration-credentials.dto.js';
import { accessTokenFromRequest, assertTrustedBrowserOrigin } from '../http-security.js';
import { ZodValidationPipe } from '../zod-validation.pipe.js';

@Controller('api/integrations')
@UseGuards(AccessTokenAuthGuard)
export class UserIntegrationsController {
  constructor(
    private readonly auth: AuthService,
    private readonly credentials: IntegrationCredentialService,
  ) {}

  @Get()
  async list(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Req() request: Request,
    @Query(new ZodValidationPipe(workspaceQuerySchema, 'invalid_workspace_query')) query: WorkspaceQuery,
  ) {
    const user = currentUser || await this.auth.authenticateAccessToken(accessTokenFromRequest(request));
    return this.credentials.list(user.id, query.workspaceSlug);
  }

  @Put(':provider')
  @UseGuards(TrustedOriginGuard)
  async save(
    @Param(new ZodValidationPipe(providerParamSchema, 'provider_not_supported')) params: ProviderParam,
    @Body(new ZodValidationPipe(saveIntegrationCredentialBodySchema, 'invalid_integration_credential_payload')) body: SaveIntegrationCredentialBodyInput,
    @CurrentUser() currentUser: AuthenticatedUser,
    @Req() request: Request,
  ) {
    assertTrustedBrowserOrigin(request);
    const user = currentUser || await this.auth.authenticateAccessToken(accessTokenFromRequest(request));
    let parsedBody;
    try {
      parsedBody = parseSaveIntegrationCredentialBody(params.provider, body);
    } catch {
      throw new BadRequestException('invalid_integration_config');
    }
    return this.credentials.save({
      userId: user.id,
      workspaceSlug: parsedBody.workspaceSlug,
      provider: params.provider,
      config: parsedBody.config,
      publicMetadata: parsedBody.publicMetadata,
      externalIdentities: parsedBody.externalIdentities,
    });
  }

  @Delete(':provider')
  @UseGuards(TrustedOriginGuard)
  async revoke(
    @Param(new ZodValidationPipe(providerParamSchema, 'provider_not_supported')) params: ProviderParam,
    @Query(new ZodValidationPipe(workspaceQuerySchema, 'invalid_workspace_query')) query: WorkspaceQuery,
    @CurrentUser() currentUser: AuthenticatedUser,
    @Req() request: Request,
  ) {
    assertTrustedBrowserOrigin(request);
    const user = currentUser || await this.auth.authenticateAccessToken(accessTokenFromRequest(request));
    return this.credentials.revoke(user.id, query.workspaceSlug, params.provider);
  }
}
