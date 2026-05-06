import { Body, Controller, Get, NotFoundException, Param, Post, Query, UseGuards } from '@nestjs/common';

import type { AuthenticatedUser } from '../../../application/auth.js';
import {
  BuildDashboardUseCase,
  GetReviewDetailUseCase,
  GetNoteDetailUseCase,
  ListPaginatedNotesUseCase,
  ListPaginatedProjectsUseCase,
  ListPaginatedRemindersUseCase,
  ListPaginatedReviewsUseCase,
  ListWorkspacesUseCase,
  QueryKnowledgeUseCase,
} from '../../../application/use-cases/index.js';
import { CurrentUser } from '../auth.decorators.js';
import { AccessTokenAuthGuard, TrustedOriginGuard } from '../auth.guards.js';
import {
  noteIdParamSchema,
  notesListQuerySchema,
  projectsListQuerySchema,
  remindersListQuerySchema,
  reviewIdParamSchema,
  reviewsListQuerySchema,
  type NoteIdParam,
  type NotesListQuery,
  type ProjectsListQuery,
  type RemindersListQuery,
  type ReviewIdParam,
  type ReviewsListQuery,
} from '../dto/dashboard.dto.js';
import { queryRequestSchema, type QueryRequest } from '../dto/query.dto.js';
import { ZodValidationPipe } from '../zod-validation.pipe.js';

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
    private readonly getNoteDetail: GetNoteDetailUseCase,
    private readonly getReviewDetail: GetReviewDetailUseCase,
    private readonly queryKnowledge: QueryKnowledgeUseCase,
  ) {}

  @Get('dashboard')
  dashboard(@CurrentUser() user: AuthenticatedUser) {
    return this.buildDashboard.execute(user.id);
  }

  @Get('projects')
  async projects(
    @Query(new ZodValidationPipe(projectsListQuerySchema, 'invalid_projects_query')) query: ProjectsListQuery,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return { ok: true, ...paginatedResponse('projects', await this.listProjectsUseCase.execute(user.id, query)) };
  }

  @Get('workspaces')
  async workspaces(@CurrentUser() user: AuthenticatedUser) {
    return { ok: true, workspaces: await this.listWorkspacesUseCase.execute(user.id) };
  }

  @Get('notes')
  async notes(
    @Query(new ZodValidationPipe(notesListQuerySchema, 'invalid_notes_query')) query: NotesListQuery,
    @CurrentUser() user: AuthenticatedUser,
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
    @Query(new ZodValidationPipe(reviewsListQuerySchema, 'invalid_reviews_query')) query: ReviewsListQuery,
    @CurrentUser() user: AuthenticatedUser,
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
    @Query(new ZodValidationPipe(remindersListQuerySchema, 'invalid_reminders_query')) query: RemindersListQuery,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return { ok: true, ...paginatedResponse('reminders', await this.listRemindersUseCase.execute(user.id, query)) };
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
}

function paginatedResponse<T>(key: string, value: { items: T[]; pagination: unknown }) {
  return { [key]: value.items, pagination: value.pagination };
}
