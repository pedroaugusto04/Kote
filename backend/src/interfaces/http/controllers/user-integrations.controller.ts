import { Body, Controller, Delete, Get, Param, Post, Query, Req, UseGuards } from '@nestjs/common';

import type { AuthenticatedUser } from '../../../application/auth.js';
import { IntegrationConnectionService } from '../../../application/integration-connections.js';
import { IntegrationCredentialService } from '../../../application/credentials.js';
import { CurrentUser } from '../auth.decorators.js';
import { AccessTokenAuthGuard, TrustedOriginGuard } from '../auth.guards.js';
import {
  connectIntegrationBodySchema,
  githubRepositoriesBodySchema,
  guidedProviderParamSchema,
  aiProviderParamSchema,
  sessionParamSchema,
  workspaceQuerySchema,
  type AiProviderParam,
  type ConnectIntegrationBody,
  type GithubRepositoriesBody,
  type GuidedProviderParam,
  type SessionParam,
  type WorkspaceQuery,
} from '../dto/integration-credentials.dto.js';
import { ZodValidationPipe } from '../zod-validation.pipe.js';

@Controller('api/integrations')
@UseGuards(AccessTokenAuthGuard)
export class UserIntegrationsController {
  constructor(
    private readonly credentials: IntegrationCredentialService,
    private readonly connections: IntegrationConnectionService,
  ) {}

  @Get()
  async list(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Query(new ZodValidationPipe(workspaceQuerySchema, 'invalid_workspace_query')) query: WorkspaceQuery,
  ) {
    return this.credentials.list(currentUser.id, query.workspaceSlug);
  }

  @Post(':provider/connect')
  @UseGuards(TrustedOriginGuard)
  async connect(
    @Param(new ZodValidationPipe(guidedProviderParamSchema, 'provider_not_supported')) params: GuidedProviderParam,
    @Body(new ZodValidationPipe(connectIntegrationBodySchema, 'invalid_integration_connection_payload')) body: ConnectIntegrationBody,
    @CurrentUser() currentUser: AuthenticatedUser,
    @Req() request: { headers: { origin?: string } },
  ) {
    return this.connections.connect({
      userId: currentUser.id,
      workspaceSlug: body.workspaceSlug,
      provider: params.provider,
      returnToPath: body.returnToPath,
      browserOrigin: request.headers.origin,
    });
  }

  @Post(':provider/test')
  @UseGuards(TrustedOriginGuard)
  async test(
    @Param(new ZodValidationPipe(aiProviderParamSchema, 'provider_not_supported')) params: AiProviderParam,
    @Query(new ZodValidationPipe(workspaceQuerySchema, 'invalid_workspace_query')) query: WorkspaceQuery,
    @CurrentUser() currentUser: AuthenticatedUser,
  ) {
    return this.credentials.test(currentUser.id, query.workspaceSlug, params.provider);
  }

  @Get('github-app/repositories')
  async listGithubRepositories(
    @Query(new ZodValidationPipe(workspaceQuerySchema, 'invalid_workspace_query')) query: WorkspaceQuery,
    @CurrentUser() currentUser: AuthenticatedUser,
  ) {
    return this.connections.listGithubRepositories({ userId: currentUser.id, workspaceSlug: query.workspaceSlug });
  }

  @Post('github-app/repositories')
  @UseGuards(TrustedOriginGuard)
  async saveGithubRepositories(
    @Body(new ZodValidationPipe(githubRepositoriesBodySchema, 'invalid_github_repositories_payload')) body: GithubRepositoriesBody,
    @CurrentUser() currentUser: AuthenticatedUser,
  ) {
    return this.connections.saveGithubRepositories({ userId: currentUser.id, workspaceSlug: body.workspaceSlug, repositories: body.repositories });
  }

  @Get(':provider/sessions/:sessionId')
  async session(
    @Param(new ZodValidationPipe(sessionParamSchema, 'connection_session_not_found')) params: SessionParam,
    @CurrentUser() currentUser: AuthenticatedUser,
  ) {
    return this.connections.session({ userId: currentUser.id, provider: params.provider, sessionId: params.sessionId });
  }

  @Delete(':provider')
  @UseGuards(TrustedOriginGuard)
  async revoke(
    @Param(new ZodValidationPipe(guidedProviderParamSchema, 'provider_not_supported')) params: GuidedProviderParam,
    @Query(new ZodValidationPipe(workspaceQuerySchema, 'invalid_workspace_query')) query: WorkspaceQuery,
    @CurrentUser() currentUser: AuthenticatedUser,
  ) {
    return this.credentials.revoke(currentUser.id, query.workspaceSlug, params.provider);
  }
}
