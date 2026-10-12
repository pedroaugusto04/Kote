import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';

import type { AuthenticatedUser } from '../../../../application/services/auth/auth.service.js';
import { queryInputSchema } from '../../../../contracts/query.js';
import { QueryKnowledgeUseCase } from '../../../../application/use-cases/index.js';
import { CurrentUser } from '../../auth.decorators.js';
import { AccessTokenAuthGuard, TrustedOriginGuard } from '../../guards/auth.guards.js';
import { ScopeGuard } from '../../guards/scope.guard.js';
import { Scoped, Scope } from '../../scope.decorators.js';
import type { WorkspaceScope } from '../../../../application/models/workspace-scope.models.js';
import { queryRequestSchema, type QueryRequest } from '../../dto/query.dto.js';
import { ZodValidationPipe } from '../../zod-validation.pipe.js';
import { normalizeScopeId } from '../../http-helpers.js';

function buildQueryUseCaseInput(
  query: QueryRequest,
  projectId?: string,
  workspaceId?: string,
) {
  return queryInputSchema.parse({
    query: query.query,
    status: query.status,
    limit: query.limit,
    page: query.page,
    pageSize: query.pageSize,
    projectId: normalizeScopeId(projectId),
    workspaceId: normalizeScopeId(workspaceId),
  });
}

@ApiTags('Search')
@Controller('api/query')
@UseGuards(AccessTokenAuthGuard)
export class QueryKnowledgeController {
  constructor(
    private readonly queryKnowledge: QueryKnowledgeUseCase,
  ) {}

  @Get()
  @UseGuards(ScopeGuard)
  @Scoped({ project: 'optional', allowAllProjects: true })
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Query Kote (GET)' })
  @ApiResponse({ status: 200, description: 'Query results retrieved successfully' })
  query(
    @Query(new ZodValidationPipe(queryRequestSchema, 'invalid_query_payload')) query: QueryRequest,
    @CurrentUser() user: AuthenticatedUser,
    @Scope() scope?: WorkspaceScope,
  ) {
    return this.queryKnowledge.execute(buildQueryUseCaseInput(query, scope?.projectId || undefined, scope?.workspaceId || undefined), user.id);
  }

  @Post()
  @UseGuards(TrustedOriginGuard, ScopeGuard)
  @Scoped({ project: 'optional', allowAllProjects: true })
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Query Kote (POST)' })
  @ApiResponse({ status: 200, description: 'Query results retrieved successfully' })
  queryPost(
    @Body(new ZodValidationPipe(queryRequestSchema, 'invalid_query_payload')) body: QueryRequest,
    @CurrentUser() user: AuthenticatedUser,
    @Scope() scope?: WorkspaceScope,
  ) {
    return this.queryKnowledge.execute(buildQueryUseCaseInput(body, scope?.projectId || undefined, scope?.workspaceId || undefined), user.id);
  }
}
