import { Body, Controller, Get, NotFoundException, Param, Post, Query, UseGuards } from '@nestjs/common';
import { z } from 'zod';

import type { AuthenticatedUser } from '../../../application/auth.js';
import { BuildDashboardUseCase, GetNoteDetailUseCase, QueryKnowledgeUseCase } from '../../../application/use-cases/index.js';
import { CurrentUser } from '../auth.decorators.js';
import { AccessTokenAuthGuard, TrustedOriginGuard } from '../auth.guards.js';
import { queryRequestSchema, type QueryRequest } from '../dto/query.dto.js';
import { ZodValidationPipe } from '../zod-validation.pipe.js';

const noteIdParamSchema = z.object({
  id: z.string().trim().min(1),
});

@Controller('api')
@UseGuards(AccessTokenAuthGuard)
export class DashboardController {
  constructor(
    private readonly buildDashboard: BuildDashboardUseCase,
    private readonly getNoteDetail: GetNoteDetailUseCase,
    private readonly queryKnowledge: QueryKnowledgeUseCase,
  ) {}

  @Get('dashboard')
  dashboard(@CurrentUser() user: AuthenticatedUser) {
    return this.buildDashboard.execute(user.id);
  }

  @Get('projects')
  async projects(@CurrentUser() user: AuthenticatedUser) {
    return { ok: true, projects: (await this.buildDashboard.execute(user.id)).projects };
  }

  @Get('workspaces')
  async workspaces(@CurrentUser() user: AuthenticatedUser) {
    return { ok: true, workspaces: (await this.buildDashboard.execute(user.id)).workspaces };
  }

  @Get('notes')
  async notes(@CurrentUser() user: AuthenticatedUser) {
    return { ok: true, notes: (await this.buildDashboard.execute(user.id)).notes };
  }

  @Get('notes/:id')
  async note(@Param(new ZodValidationPipe(noteIdParamSchema, 'invalid_note_id')) params: { id: string }, @CurrentUser() user: AuthenticatedUser) {
    const note = await this.getNoteDetail.execute(user.id, params.id);
    if (!note) throw new NotFoundException('note_not_found');
    return { ok: true, note };
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
