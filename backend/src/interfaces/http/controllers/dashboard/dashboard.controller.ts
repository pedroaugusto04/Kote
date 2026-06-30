import { Body, Controller, Get, NotFoundException, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiParam, ApiBody, ApiQuery } from '@nestjs/swagger';

import type { AuthenticatedUser } from '../../../../application/auth.js';
import { queryInputSchema } from '../../../../contracts/query.js';
import {
  BuildDashboardUseCase,
  GetReviewDetailUseCase,
  ListReminderBoardUseCase,
  ListPaginatedProjectsUseCase,
  ListPaginatedRemindersUseCase,
  ListPaginatedReviewsUseCase,
  ListWorkspacesUseCase,
  QueryKnowledgeUseCase,
  UpdateReminderStatusUseCase,
  BulkUpdateReminderStatusUseCase,
  RunAskAiUseCase,
  ListAskHistoryUseCase,
} from '../../../../application/use-cases/index.js';
import { CurrentUser } from '../../auth.decorators.js';
import { AccessTokenAuthGuard, TrustedOriginGuard } from '../../guards/auth.guards.js';
import { OptionalProjectResolutionGuard } from '../../guards/project-resolution.guard.js';
import { ProjectId } from '../../project.decorators.js';
import { WorkspaceId } from '../../workspace.decorators.js';
import {
  projectsListQuerySchema,
  reminderBoardQuerySchema,
  reminderIdParamSchema,
  remindersListQuerySchema,
  reviewIdParamSchema,
  reviewsListQuerySchema,
  updateReminderStatusBodySchema,
  bulkUpdateReminderStatusBodySchema,
  type ReminderBoardQuery,
  type ReminderIdParam,
  type ProjectsListQuery,
  type RemindersListQuery,
  type ReviewIdParam,
  type ReviewsListQuery,
  type UpdateReminderStatusBody,
  type BulkUpdateReminderStatusBody,
} from '../../dto/dashboard.dto.js';
import { queryRequestSchema, type QueryRequest } from '../../dto/query.dto.js';
import { askHistoryQuerySchema, askRequestSchema, type AskHistoryQuery, type AskRequest } from '../../dto/ask.dto.js';
import { ZodValidationPipe } from '../../zod-validation.pipe.js';
import { paginatedResponse } from '../../http-helpers.js';

function normalizeScopeId(value?: string) {
  return value && value !== 'all' ? value : undefined;
}

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

@ApiTags('Dashboard')
@Controller('api')
@UseGuards(AccessTokenAuthGuard)
export class DashboardController {
  constructor(
    private readonly buildDashboard: BuildDashboardUseCase,
    private readonly listProjectsUseCase: ListPaginatedProjectsUseCase,
    private readonly listWorkspacesUseCase: ListWorkspacesUseCase,
    private readonly listReviewsUseCase: ListPaginatedReviewsUseCase,
    private readonly listRemindersUseCase: ListPaginatedRemindersUseCase,
    private readonly listReminderBoardUseCase: ListReminderBoardUseCase,
    private readonly updateReminderStatusUseCase: UpdateReminderStatusUseCase,
    private readonly getReviewDetail: GetReviewDetailUseCase,
    private readonly queryKnowledge: QueryKnowledgeUseCase,
    private readonly runAskAiUseCase: RunAskAiUseCase,
    private readonly listAskHistoryUseCase: ListAskHistoryUseCase,
    private readonly bulkUpdateReminderStatusUseCase: BulkUpdateReminderStatusUseCase,
  ) {}

  @Get('dashboard')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get dashboard data' })
  @ApiResponse({ status: 200, description: 'Dashboard data retrieved successfully' })
  dashboard(@CurrentUser() user: AuthenticatedUser) {
    return this.buildDashboard.execute(user.id);
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

  @Get('reviews')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'List reviews' })
  @ApiResponse({ status: 200, description: 'Reviews retrieved successfully' })
  async reviews(
    @CurrentUser() user: AuthenticatedUser,
    @Query(new ZodValidationPipe(reviewsListQuerySchema, 'invalid_reviews_query')) query: ReviewsListQuery,
  ) {
    return { ok: true, ...paginatedResponse('reviews', await this.listReviewsUseCase.execute(user.id, query)) };
  }

  @Get('reviews/:id')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get review detail' })
  @ApiParam({ name: 'id', description: 'Review ID' })
  @ApiResponse({ status: 200, description: 'Review detail retrieved successfully' })
  @ApiResponse({ status: 404, description: 'Review not found' })
  async review(@Param(new ZodValidationPipe(reviewIdParamSchema, 'invalid_review_id')) params: ReviewIdParam, @CurrentUser() user: AuthenticatedUser) {
    const review = await this.getReviewDetail.execute(user.id, params.id);
    if (!review) throw new NotFoundException('review_not_found');
    return { ok: true, review };
  }

  @Get('reminders')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'List reminders' })
  @ApiResponse({ status: 200, description: 'Reminders retrieved successfully' })
  async reminders(
    @CurrentUser() user: AuthenticatedUser,
    @Query(new ZodValidationPipe(remindersListQuerySchema, 'invalid_reminders_query')) query: RemindersListQuery,
  ) {
    return { ok: true, ...paginatedResponse('reminders', await this.listRemindersUseCase.execute(user.id, query)) };
  }

  @Get('reminders/board')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get reminder board' })
  @ApiResponse({ status: 200, description: 'Reminder board retrieved successfully' })
  async reminderBoard(
    @CurrentUser() user: AuthenticatedUser,
    @Query(new ZodValidationPipe(reminderBoardQuerySchema, 'invalid_reminder_board_query')) query: ReminderBoardQuery,
  ) {
    return { ok: true, ...(await this.listReminderBoardUseCase.execute(user.id, query)) };
  }

  @Patch('reminders/bulk/status')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Bulk update reminder statuses' })
  @ApiResponse({ status: 200, description: 'Reminder statuses updated successfully' })
  async bulkUpdateReminderStatus(
    @Body(new ZodValidationPipe(bulkUpdateReminderStatusBodySchema, 'invalid_bulk_update_reminder_status_payload')) body: BulkUpdateReminderStatusBody,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const result = await this.bulkUpdateReminderStatusUseCase.execute(user.id, body.ids, body.status);
    return result;
  }

  @Patch('reminders/:id/status')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update reminder status' })
  @ApiParam({ name: 'id', description: 'Reminder ID' })
  @ApiResponse({ status: 200, description: 'Reminder status updated' })
  @ApiResponse({ status: 404, description: 'Reminder not found' })
  async updateReminderStatus(
    @Param(new ZodValidationPipe(reminderIdParamSchema, 'invalid_reminder_id')) params: ReminderIdParam,
    @Body(new ZodValidationPipe(updateReminderStatusBodySchema, 'invalid_reminder_status_payload')) body: UpdateReminderStatusBody,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const result = await this.updateReminderStatusUseCase.execute(user.id, { id: params.id, status: body.status });
    if (!result.ok) throw new NotFoundException(result.reason);
    return result;
  }

  @Get('query')
  @UseGuards(OptionalProjectResolutionGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Query Kote (GET)' })
  @ApiResponse({ status: 200, description: 'Query results retrieved successfully' })
  query(
    @Query(new ZodValidationPipe(queryRequestSchema, 'invalid_query_payload')) query: QueryRequest,
    @CurrentUser() user: AuthenticatedUser,
    @ProjectId() projectId?: string,
    @WorkspaceId() workspaceId?: string,
  ) {
    return this.queryKnowledge.execute(buildQueryUseCaseInput(query, projectId, workspaceId), user.id);
  }

  @Post('query')
  @UseGuards(TrustedOriginGuard, OptionalProjectResolutionGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Query Kote (POST)' })
  @ApiResponse({ status: 200, description: 'Query results retrieved successfully' })
  queryPost(
    @Body(new ZodValidationPipe(queryRequestSchema, 'invalid_query_payload')) body: QueryRequest,
    @CurrentUser() user: AuthenticatedUser,
    @ProjectId() projectId?: string,
    @WorkspaceId() workspaceId?: string,
  ) {
    return this.queryKnowledge.execute(buildQueryUseCaseInput(body, projectId, workspaceId), user.id);
  }

  @Post('ask')
  @UseGuards(TrustedOriginGuard, OptionalProjectResolutionGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Ask AI a question' })
  @ApiResponse({ status: 200, description: 'AI response retrieved successfully' })
  ask(
    @Body(new ZodValidationPipe(askRequestSchema, 'invalid_ask_payload')) body: AskRequest,
    @CurrentUser() user: AuthenticatedUser,
    @ProjectId() projectId?: string,
    @WorkspaceId() workspaceId?: string,
  ) {
    return this.runAskAiUseCase.execute(body.question, user.id, {
      projectId: normalizeScopeId(projectId),
      workspaceId: normalizeScopeId(workspaceId),
    });
  }

  @Get('ask/history')
  @UseGuards(OptionalProjectResolutionGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get AI conversation history' })
  @ApiResponse({ status: 200, description: 'Conversation history retrieved successfully' })
  async askHistory(
    @Query(new ZodValidationPipe(askHistoryQuerySchema, 'invalid_ask_history_query')) query: AskHistoryQuery,
    @CurrentUser() user: AuthenticatedUser,
    @ProjectId() projectId?: string,
  ) {
    return {
      ok: true,
      ...paginatedResponse('history', await this.listAskHistoryUseCase.execute(user.id, {
        page: query.page,
        pageSize: query.pageSize,
        projectId: normalizeScopeId(projectId),
      })),
    };
  }
}
