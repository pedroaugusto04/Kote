import { Body, Controller, Delete, Get, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiParam, ApiBody, ApiQuery } from '@nestjs/swagger';

import type { AuthenticatedUser } from '../../../../application/services/auth/auth.service.js';
import { IntegrationConnectionService } from '../../../../application/services/integrations/integration-connection.service.js';
import { IntegrationCredentialService } from '../../../../application/services/integrations/integration-credentials.service.js';
import { GithubBackfillUseCase } from '../../../../application/use-cases/integrations/github-backfill.use-case.js';
import { CurrentUser } from '../../auth.decorators.js';
import { AccessTokenAuthGuard, TrustedOriginGuard } from '../../guards/auth.guards.js';
import { ScopeGuard } from '../../guards/scope.guard.js';
import { Scoped, Scope } from '../../scope.decorators.js';
import type { WorkspaceScope } from '../../../../application/models/workspace-scope.models.js';
import {
  connectIntegrationBodySchema,
  githubBackfillBodySchema,
  githubBackfillStatusQuerySchema,
  githubBackfillCancelBodySchema,
  githubRepositoriesBodySchema,
  guidedProviderParamSchema,
  aiProviderParamSchema,
  sessionParamSchema,
  type AiProviderParam,
  type ConnectIntegrationBody,
  type GithubBackfillBody,
  type GithubBackfillStatusQuery,
  type GithubBackfillCancelBody,
  type GithubRepositoriesBody,
  type GuidedProviderParam,
  type SessionParam,
} from '../../dto/integration-credentials.dto.js';
import { ZodValidationPipe } from '../../zod-validation.pipe.js';

@ApiTags('Integrations')
@Controller('api/integrations')
@UseGuards(AccessTokenAuthGuard)
export class UserIntegrationsController {
  constructor(
    private readonly credentials: IntegrationCredentialService,
    private readonly connections: IntegrationConnectionService,
    private readonly githubBackfill: GithubBackfillUseCase,
  ) {}

  @Get()
  @UseGuards(ScopeGuard)
  @Scoped({ project: 'none' })
  @ApiBearerAuth()
  @ApiOperation({ summary: 'List user integrations' })
  @ApiResponse({ status: 200, description: 'Integrations retrieved successfully' })
  async list(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Scope() scope: WorkspaceScope,
  ) {
    return this.credentials.list(currentUser.id, scope.workspaceSlug);
  }

  @Post('github-app/backfill')
  @UseGuards(TrustedOriginGuard, ScopeGuard)
  @Scoped({ project: 'none' })
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Import recent GitHub commits as code reviews' })
  @ApiResponse({ status: 200, description: 'Backfill started successfully' })
  async startGithubBackfill(
    @Body(new ZodValidationPipe(githubBackfillBodySchema, 'invalid_github_backfill_payload')) body: GithubBackfillBody,
    @CurrentUser() currentUser: AuthenticatedUser,
    @Scope() scope: WorkspaceScope,
  ) {
    return this.githubBackfill.start({
      userId: currentUser.id,
      workspaceSlug: scope.workspaceSlug,
      repositories: body.repositories,
    });
  }

  @Get('github-app/backfill/status')
  @UseGuards(ScopeGuard)
  @Scoped({ project: 'none' })
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get GitHub backfill job status' })
  @ApiResponse({ status: 200, description: 'Backfill status retrieved successfully' })
  async getGithubBackfillStatus(
    @Query(new ZodValidationPipe(githubBackfillStatusQuerySchema, 'invalid_github_backfill_status_query')) query: GithubBackfillStatusQuery,
    @CurrentUser() currentUser: AuthenticatedUser,
    @Scope() scope: WorkspaceScope,
  ) {
    const job = await this.githubBackfill.getJob(query.jobId, currentUser.id);
    if (!job || job.workspaceSlug !== scope.workspaceSlug) {
      return { ok: false as const, status: 'not_found' as const };
    }
    return {
      ok: true as const,
      job: {
        id: job.id,
        status: job.status,
        total: job.total,
        processed: job.processed,
        imported: job.imported,
        skipped: job.skipped,
        limit: job.limit,
        repositories: job.repositories,
        error: job.error,
        startedAt: job.startedAt,
        updatedAt: job.updatedAt,
        completedAt: job.completedAt,
      },
    };
  }

  @Post('github-app/backfill/cancel')
  @UseGuards(TrustedOriginGuard, ScopeGuard)
  @Scoped({ project: 'none' })
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Cancel running GitHub backfill job' })
  @ApiResponse({ status: 200, description: 'Backfill cancelled successfully' })
  async cancelGithubBackfill(
    @Body(new ZodValidationPipe(githubBackfillCancelBodySchema, 'invalid_github_backfill_cancel_payload')) body: GithubBackfillCancelBody,
    @CurrentUser() currentUser: AuthenticatedUser,
  ) {
    const success = await this.githubBackfill.cancel(body.jobId, currentUser.id);
    return { ok: success };
  }

  @Post(':provider/connect')
  @UseGuards(TrustedOriginGuard, ScopeGuard)
  @Scoped({ project: 'none' })
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Connect to an integration provider' })
  @ApiParam({ name: 'provider', description: 'Integration provider' })
  @ApiResponse({ status: 200, description: 'Connection initiated successfully' })
  async connect(
    @Param(new ZodValidationPipe(guidedProviderParamSchema, 'provider_not_supported')) params: GuidedProviderParam,
    @Body(new ZodValidationPipe(connectIntegrationBodySchema, 'invalid_integration_connection_payload')) body: ConnectIntegrationBody,
    @CurrentUser() currentUser: AuthenticatedUser,
    @Req() request: { headers: { origin?: string } },
    @Scope() scope?: WorkspaceScope,
  ) {
    const workspaceSlug = scope?.workspaceSlug || body.workspaceSlug;
    return this.connections.connect({
      userId: currentUser.id,
      workspaceSlug,
      provider: params.provider,
      returnToPath: body.returnToPath,
      browserOrigin: request?.headers?.origin,
    });
  }

  @Post(':provider/test')
  @UseGuards(TrustedOriginGuard, ScopeGuard)
  @Scoped({ project: 'none' })
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Test an integration connection' })
  @ApiParam({ name: 'provider', description: 'Integration provider' })
  @ApiResponse({ status: 200, description: 'Connection test successful' })
  async test(
    @Param(new ZodValidationPipe(aiProviderParamSchema, 'provider_not_supported')) params: AiProviderParam,
    @CurrentUser() currentUser: AuthenticatedUser,
    @Scope() scope: WorkspaceScope,
  ) {
    return this.credentials.test(currentUser.id, scope.workspaceSlug, params.provider);
  }

  @Get('github-app/repositories')
  @UseGuards(ScopeGuard)
  @Scoped({ project: 'none' })
  @ApiBearerAuth()
  @ApiOperation({ summary: 'List GitHub App repositories' })
  @ApiResponse({ status: 200, description: 'Repositories retrieved successfully' })
  async listGithubRepositories(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Scope() scope: WorkspaceScope,
  ) {
    return this.connections.listGithubRepositories({ userId: currentUser.id, workspaceSlug: scope.workspaceSlug });
  }

  @Post('github-app/repositories')
  @UseGuards(TrustedOriginGuard, ScopeGuard)
  @Scoped({ project: 'none' })
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Save GitHub App repositories' })
  @ApiResponse({ status: 200, description: 'Repositories saved successfully' })
  async saveGithubRepositories(
    @Body(new ZodValidationPipe(githubRepositoriesBodySchema, 'invalid_github_repositories_payload')) body: GithubRepositoriesBody,
    @CurrentUser() currentUser: AuthenticatedUser,
    @Scope() scope: WorkspaceScope,
  ) {
    return this.connections.saveGithubRepositories({ userId: currentUser.id, workspaceSlug: scope.workspaceSlug, repositories: body.repositories });
  }

  @Get(':provider/sessions/:sessionId')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get integration session status' })
  @ApiParam({ name: 'provider', description: 'Integration provider' })
  @ApiParam({ name: 'sessionId', description: 'Session ID' })
  @ApiResponse({ status: 200, description: 'Session retrieved successfully' })
  async session(
    @Param(new ZodValidationPipe(sessionParamSchema, 'connection_session_not_found')) params: SessionParam,
    @CurrentUser() currentUser: AuthenticatedUser,
  ) {
    return this.connections.session({ userId: currentUser.id, provider: params.provider, sessionId: params.sessionId });
  }

  @Delete(':provider')
  @UseGuards(TrustedOriginGuard, ScopeGuard)
  @Scoped({ project: 'none' })
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Revoke integration connection' })
  @ApiParam({ name: 'provider', description: 'Integration provider' })
  @ApiResponse({ status: 200, description: 'Connection revoked successfully' })
  async revoke(
    @Param(new ZodValidationPipe(guidedProviderParamSchema, 'provider_not_supported')) params: GuidedProviderParam,
    @CurrentUser() currentUser: AuthenticatedUser,
    @Scope() scope: WorkspaceScope,
  ) {
    return this.credentials.revoke(currentUser.id, scope.workspaceSlug, params.provider);
  }
}
