import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';

import type { AuthenticatedUser } from '../../../../application/services/auth/auth.service.js';
import {
  BuildDashboardUseCase,
  ListPaginatedProjectsUseCase,
  ListWorkspacesUseCase,
  GetProductivityInsightsRawUseCase,
  GetAiTokenAnalyticsUseCase,
} from '../../../../application/use-cases/index.js';
import { CurrentUser } from '../../auth.decorators.js';
import { AccessTokenAuthGuard } from '../../guards/auth.guards.js';
import { ScopeGuard } from '../../guards/scope.guard.js';
import { Scoped, Scope } from '../../scope.decorators.js';
import type { WorkspaceScope } from '../../../../application/models/workspace-scope.models.js';
import {
  projectsListQuerySchema,
  aiAnalyticsQuerySchema,
  type ProjectsListQuery,
  type AiAnalyticsQuery,
} from '../../dto/dashboard.dto.js';
import { ZodValidationPipe } from '../../zod-validation.pipe.js';
import { paginatedResponse, normalizeScopeId } from '../../http-helpers.js';
import { toAiTokenAnalyticsFilter } from '../../mappers/dashboard.mapper.js';

@ApiTags('Dashboard')
@Controller('api')
@UseGuards(AccessTokenAuthGuard)
export class DashboardController {
  constructor(
    private readonly buildDashboard: BuildDashboardUseCase,
    private readonly listProjectsUseCase: ListPaginatedProjectsUseCase,
    private readonly listWorkspacesUseCase: ListWorkspacesUseCase,
    private readonly getProductivityInsightsUseCase: GetProductivityInsightsRawUseCase,
    private readonly getAiTokenAnalyticsUseCase: GetAiTokenAnalyticsUseCase,
  ) {}

  @Get('dashboard')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get dashboard data' })
  @ApiResponse({ status: 200, description: 'Dashboard data retrieved successfully' })
  dashboard(@CurrentUser() user: AuthenticatedUser) {
    return this.buildDashboard.execute(user.id);
  }

  @Get('dashboard/ai-analytics')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get AI token usage analytics and cost metrics' })
  @ApiResponse({ status: 200, description: 'AI token analytics retrieved successfully' })
  @UseGuards(ScopeGuard)
  @Scoped({ project: 'optional', allowAllProjects: true })
  async getAiAnalytics(
    @CurrentUser() user: AuthenticatedUser,
    @Scope() scope?: WorkspaceScope,
    @Query(new ZodValidationPipe(aiAnalyticsQuerySchema, 'invalid_ai_analytics_query')) query?: AiAnalyticsQuery,
  ) {
    const filter = toAiTokenAnalyticsFilter(query, scope);
    return this.getAiTokenAnalyticsUseCase.execute(user.id, filter);
  }

  @Get('productivity/insights')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get developer productivity insights' })
  @ApiResponse({ status: 200, description: 'Productivity insights retrieved successfully' })
  getProductivityInsights(@CurrentUser() user: AuthenticatedUser) {
    return this.getProductivityInsightsUseCase.execute(user.id);
  }

  @Get('projects')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'List projects' })
  @ApiResponse({ status: 200, description: 'Projects retrieved successfully' })
  async projects(
    @CurrentUser() user: AuthenticatedUser,
    @Query(new ZodValidationPipe(projectsListQuerySchema, 'invalid_projects_query')) query: ProjectsListQuery,
  ) {
    return { ok: true, ...paginatedResponse('projects', await this.listProjectsUseCase.execute(user.id, query)) };
  }

  @Get('workspaces')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'List workspaces' })
  @ApiResponse({ status: 200, description: 'Workspaces retrieved successfully' })
  async workspaces(@CurrentUser() user: AuthenticatedUser) {
    return { ok: true, workspaces: await this.listWorkspacesUseCase.execute(user.id) };
  }
}

