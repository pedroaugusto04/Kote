import { Body, Controller, Get, NotFoundException, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';

import type { AuthenticatedUser } from '../../../../application/auth.js';
import {
  BuildDashboardUseCase,
  GetReviewDetailUseCase,
  GetNoteDetailUseCase,
  ListReminderBoardUseCase,
  ListPaginatedNotesUseCase,
  ListPaginatedProjectsUseCase,
  ListPaginatedRemindersUseCase,
  ListPaginatedReviewsUseCase,
  ListWorkspacesUseCase,
  QueryKnowledgeUseCase,
  UpdateReminderStatusUseCase,
  RunAskAiUseCase,
  ListAskHistoryUseCase,
} from '../../../../application/use-cases/index.js';
import { CurrentUser } from '../../auth.decorators.js';
import { AccessTokenAuthGuard, TrustedOriginGuard } from '../../auth.guards.js';
import {
  noteIdParamSchema,
  notesListQuerySchema,
  projectsListQuerySchema,
  reminderBoardQuerySchema,
  reminderIdParamSchema,
  remindersListQuerySchema,
  reviewIdParamSchema,
  reviewsListQuerySchema,
  updateReminderStatusBodySchema,
  type ReminderBoardQuery,
  type ReminderIdParam,
  type NoteIdParam,
  type NotesListQuery,
  type ProjectsListQuery,
  type RemindersListQuery,
  type ReviewIdParam,
  type ReviewsListQuery,
  type UpdateReminderStatusBody,
} from '../../dto/dashboard.dto.js';
import { queryRequestSchema, type QueryRequest } from '../../dto/query.dto.js';
import { askHistoryQuerySchema, askRequestSchema, type AskHistoryQuery, type AskRequest } from '../../dto/ask.dto.js';
import { ZodValidationPipe } from '../../zod-validation.pipe.js';

@Controller('api')
@UseGuards(AccessTokenAuthGuard)
export class DashboardController {
  constructor(
    private readonly buildDashboard: BuildDashboardUseCase,
    private readonly listProjectsUseCase: ListPaginatedProjectsUseCase,
    private readonly listWorkspacesUseCase: ListWorkspacesUseCase,
    private readonly listNotesUseCase: ListPaginatedNotesUseCase,
    private readonly listReviewsUseCase: ListPaginatedReviewsUseCase,
    private readonly listRemindersUseCase: ListPaginatedRemindersUseCase,
    private readonly listReminderBoardUseCase: ListReminderBoardUseCase,
    private readonly updateReminderStatusUseCase: UpdateReminderStatusUseCase,
    private readonly getNoteDetail: GetNoteDetailUseCase,
    private readonly getReviewDetail: GetReviewDetailUseCase,
    private readonly queryKnowledge: QueryKnowledgeUseCase,
    private readonly runAskAiUseCase: RunAskAiUseCase,
    private readonly listAskHistoryUseCase: ListAskHistoryUseCase,
  ) {}

  @Get('dashboard')
  dashboard(@CurrentUser() user: AuthenticatedUser) {
    return this.buildDashboard.execute(user.id);
  }

  @Get('projects')
  async projects(
    @CurrentUser() user: AuthenticatedUser,
    @Query(new ZodValidationPipe(projectsListQuerySchema, 'invalid_projects_query')) query: ProjectsListQuery,
  ) {
    return { ok: true, ...paginatedResponse('projects', await this.listProjectsUseCase.execute(user.id, query)) };
  }

  @Get('workspaces')
  async workspaces(@CurrentUser() user: AuthenticatedUser) {
    return { ok: true, workspaces: await this.listWorkspacesUseCase.execute(user.id) };
  }

  @Get('notes')
  async notes(
    @CurrentUser() user: AuthenticatedUser,
    @Query(new ZodValidationPipe(notesListQuerySchema, 'invalid_notes_query')) query: NotesListQuery,
  ) {
    return { ok: true, ...paginatedResponse('notes', await this.listNotesUseCase.execute(user.id, query)) };
  }

  @Get('notes/:id')
  async note(@Param(new ZodValidationPipe(noteIdParamSchema, 'invalid_note_id')) params: NoteIdParam, @CurrentUser() user: AuthenticatedUser) {
    const note = await this.getNoteDetail.execute(user.id, params.id);
    if (!note) throw new NotFoundException('note_not_found');
    return { ok: true, note };
  }

  @Get('reviews')
  async reviews(
    @CurrentUser() user: AuthenticatedUser,
    @Query(new ZodValidationPipe(reviewsListQuerySchema, 'invalid_reviews_query')) query: ReviewsListQuery,
  ) {
    return { ok: true, ...paginatedResponse('reviews', await this.listReviewsUseCase.execute(user.id, query)) };
  }

  @Get('reviews/:id')
  async review(@Param(new ZodValidationPipe(reviewIdParamSchema, 'invalid_review_id')) params: ReviewIdParam, @CurrentUser() user: AuthenticatedUser) {
    const review = await this.getReviewDetail.execute(user.id, params.id);
    if (!review) throw new NotFoundException('review_not_found');
    return { ok: true, review };
  }

  @Get('reminders')
  async reminders(
    @CurrentUser() user: AuthenticatedUser,
    @Query(new ZodValidationPipe(remindersListQuerySchema, 'invalid_reminders_query')) query: RemindersListQuery,
  ) {
    return { ok: true, ...paginatedResponse('reminders', await this.listRemindersUseCase.execute(user.id, query)) };
  }

  @Get('reminders/board')
  async reminderBoard(
    @CurrentUser() user: AuthenticatedUser,
    @Query(new ZodValidationPipe(reminderBoardQuerySchema, 'invalid_reminder_board_query')) query: ReminderBoardQuery,
  ) {
    return { ok: true, ...(await this.listReminderBoardUseCase.execute(user.id, query)) };
  }

  @Patch('reminders/:id/status')
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
  query(@Query(new ZodValidationPipe(queryRequestSchema, 'invalid_query_payload')) query: QueryRequest, @CurrentUser() user: AuthenticatedUser) {
    return this.queryKnowledge.execute(query, user.id);
  }

  @Post('query')
  @UseGuards(TrustedOriginGuard)
  queryPost(@Body(new ZodValidationPipe(queryRequestSchema, 'invalid_query_payload')) body: QueryRequest, @CurrentUser() user: AuthenticatedUser) {
    return this.queryKnowledge.execute(body, user.id);
  }

  @Post('ask')
  @UseGuards(TrustedOriginGuard)
  ask(
    @Body(new ZodValidationPipe(askRequestSchema, 'invalid_ask_payload')) body: AskRequest,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.runAskAiUseCase.execute(body.question, user.id, {
      projectSlug: body.projectSlug,
      workspaceSlug: body.workspaceSlug,
    });
  }

  @Get('ask/history')
  async askHistory(
    @Query(new ZodValidationPipe(askHistoryQuerySchema, 'invalid_ask_history_query')) query: AskHistoryQuery,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return { ok: true, ...paginatedResponse('history', await this.listAskHistoryUseCase.execute(user.id, query)) };
  }
}

function paginatedResponse<T>(key: string, value: { items: T[]; pagination: unknown }) {
  return { [key]: value.items, pagination: value.pagination };
}
