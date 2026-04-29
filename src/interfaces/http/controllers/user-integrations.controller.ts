import { Body, Controller, Delete, Get, Param, Post, Query, Req, Res, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import type { Response } from 'express';

import { AuthService, type AuthenticatedUser } from '../../../application/auth.js';
import { IntegrationConnectionService } from '../../../application/integration-connections.js';
import { IntegrationCredentialService } from '../../../application/credentials.js';
import { CurrentUser } from '../auth.decorators.js';
import { AccessTokenAuthGuard, TrustedOriginGuard } from '../auth.guards.js';
import {
  connectIntegrationBodySchema,
  githubAppCallbackQuerySchema,
  githubRepositoriesBodySchema,
  guidedProviderParamSchema,
  aiProviderParamSchema,
  sessionParamSchema,
  workspaceQuerySchema,
  type AiProviderParam,
  type ConnectIntegrationBody,
  type GithubAppCallbackQuery,
  type GithubRepositoriesBody,
  type GuidedProviderParam,
  type SessionParam,
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
    private readonly connections: IntegrationConnectionService,
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

  @Post(':provider/connect')
  @UseGuards(TrustedOriginGuard)
  async connect(
    @Param(new ZodValidationPipe(guidedProviderParamSchema, 'provider_not_supported')) params: GuidedProviderParam,
    @Body(new ZodValidationPipe(connectIntegrationBodySchema, 'invalid_integration_connection_payload')) body: ConnectIntegrationBody,
    @CurrentUser() currentUser: AuthenticatedUser,
    @Req() request: Request,
  ) {
    assertTrustedBrowserOrigin(request);
    const user = currentUser || await this.auth.authenticateAccessToken(accessTokenFromRequest(request));
    return this.connections.connect({
      userId: user.id,
      workspaceSlug: body.workspaceSlug,
      provider: params.provider,
      returnToPath: body.returnToPath,
      browserOrigin: request.headers.origin,
    });
  }

  @Get('github-app/callback')
  async githubAppCallback(
    @Query(new ZodValidationPipe(githubAppCallbackQuerySchema, 'invalid_github_app_callback')) query: GithubAppCallbackQuery,
    @CurrentUser() currentUser: AuthenticatedUser,
    @Req() request: Request,
    @Res() response: Response,
  ) {
    const user = currentUser || await this.auth.authenticateAccessToken(accessTokenFromRequest(request));
    const result = await this.connections.completeGithubForBrowser({
      userId: user.id,
      state: query.state,
      code: query.code,
      installationId: query.installation_id,
    });
    return response.redirect(302, result.redirectUrl);
  }

  @Post(':provider/test')
  @UseGuards(TrustedOriginGuard)
  async test(
    @Param(new ZodValidationPipe(aiProviderParamSchema, 'provider_not_supported')) params: AiProviderParam,
    @Query(new ZodValidationPipe(workspaceQuerySchema, 'invalid_workspace_query')) query: WorkspaceQuery,
    @CurrentUser() currentUser: AuthenticatedUser,
    @Req() request: Request,
  ) {
    assertTrustedBrowserOrigin(request);
    const user = currentUser || await this.auth.authenticateAccessToken(accessTokenFromRequest(request));
    return this.credentials.test(user.id, query.workspaceSlug, params.provider);
  }

  @Get('github-app/repositories')
  async listGithubRepositories(
    @Query(new ZodValidationPipe(workspaceQuerySchema, 'invalid_workspace_query')) query: WorkspaceQuery,
    @CurrentUser() currentUser: AuthenticatedUser,
    @Req() request: Request,
  ) {
    const user = currentUser || await this.auth.authenticateAccessToken(accessTokenFromRequest(request));
    return this.connections.listGithubRepositories({ userId: user.id, workspaceSlug: query.workspaceSlug });
  }

  @Post('github-app/repositories')
  @UseGuards(TrustedOriginGuard)
  async saveGithubRepositories(
    @Body(new ZodValidationPipe(githubRepositoriesBodySchema, 'invalid_github_repositories_payload')) body: GithubRepositoriesBody,
    @CurrentUser() currentUser: AuthenticatedUser,
    @Req() request: Request,
  ) {
    assertTrustedBrowserOrigin(request);
    const user = currentUser || await this.auth.authenticateAccessToken(accessTokenFromRequest(request));
    return this.connections.saveGithubRepositories({ userId: user.id, workspaceSlug: body.workspaceSlug, repositories: body.repositories });
  }

  @Get(':provider/sessions/:sessionId')
  async session(
    @Param(new ZodValidationPipe(sessionParamSchema, 'connection_session_not_found')) params: SessionParam,
    @CurrentUser() currentUser: AuthenticatedUser,
    @Req() request: Request,
  ) {
    const user = currentUser || await this.auth.authenticateAccessToken(accessTokenFromRequest(request));
    return this.connections.session({ userId: user.id, provider: params.provider, sessionId: params.sessionId });
  }

  @Delete(':provider')
  @UseGuards(TrustedOriginGuard)
  async revoke(
    @Param(new ZodValidationPipe(guidedProviderParamSchema, 'provider_not_supported')) params: GuidedProviderParam,
    @Query(new ZodValidationPipe(workspaceQuerySchema, 'invalid_workspace_query')) query: WorkspaceQuery,
    @CurrentUser() currentUser: AuthenticatedUser,
    @Req() request: Request,
  ) {
    assertTrustedBrowserOrigin(request);
    const user = currentUser || await this.auth.authenticateAccessToken(accessTokenFromRequest(request));
    return this.credentials.revoke(user.id, query.workspaceSlug, params.provider);
  }
}
