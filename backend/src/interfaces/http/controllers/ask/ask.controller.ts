import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiParam } from '@nestjs/swagger';

import type { AuthenticatedUser } from '../../../../application/services/auth/auth.service.js';
import {
  RunAskAiUseCase,
  ListAskHistoryUseCase,
  ListAskConversationsUseCase,
  GetAskConversationTurnsUseCase,
} from '../../../../application/use-cases/index.js';
import { CurrentUser } from '../../auth.decorators.js';
import { AccessTokenAuthGuard, TrustedOriginGuard } from '../../guards/auth.guards.js';
import { ScopeGuard } from '../../guards/scope.guard.js';
import { Scoped, Scope } from '../../scope.decorators.js';
import type { WorkspaceScope } from '../../../../application/models/workspace-scope.models.js';
import {
  askHistoryQuerySchema,
  askRequestSchema,
  conversationIdParamSchema,
  type AskHistoryQuery,
  type AskRequest,
  type ConversationIdParam,
} from '../../dto/ask.dto.js';
import { ZodValidationPipe } from '../../zod-validation.pipe.js';
import { paginatedResponse, normalizeScopeId } from '../../http-helpers.js';

@ApiTags('Ask AI')
@Controller('api/ask')
@UseGuards(AccessTokenAuthGuard)
export class AskAiController {
  constructor(
    private readonly runAskAiUseCase: RunAskAiUseCase,
    private readonly listAskConversationsUseCase: ListAskConversationsUseCase,
    private readonly getAskConversationTurnsUseCase: GetAskConversationTurnsUseCase,
    private readonly listAskHistoryUseCase: ListAskHistoryUseCase,
  ) {}

  @Post()
  @UseGuards(TrustedOriginGuard, ScopeGuard)
  @Scoped({ project: 'optional', allowAllProjects: true })
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Ask AI a question' })
  @ApiResponse({ status: 200, description: 'AI response retrieved successfully' })
  ask(
    @Body(new ZodValidationPipe(askRequestSchema, 'invalid_ask_payload')) body: AskRequest,
    @CurrentUser() user: AuthenticatedUser,
    @Scope() scope?: WorkspaceScope,
  ) {
    return this.runAskAiUseCase.execute(
      body.question,
      user.id,
      {
        projectId: normalizeScopeId(scope?.projectId),
        workspaceId: normalizeScopeId(scope?.workspaceId),
      },
      body.conversationId,
      body.conversationHistory,
    );
  }

  @Get('conversations')
  @UseGuards(ScopeGuard)
  @Scoped({ project: 'optional', allowAllProjects: true })
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get AI conversation list' })
  @ApiResponse({ status: 200, description: 'Conversations retrieved successfully' })
  async askConversations(
    @Query(new ZodValidationPipe(askHistoryQuerySchema, 'invalid_ask_conversations_query')) query: AskHistoryQuery,
    @CurrentUser() user: AuthenticatedUser,
    @Scope() scope?: WorkspaceScope,
  ) {
    return {
      ok: true,
      ...paginatedResponse('conversations', await this.listAskConversationsUseCase.execute(user.id, {
        page: query.page,
        pageSize: query.pageSize,
        projectId: normalizeScopeId(scope?.projectId),
      })),
    };
  }

  @Get('conversations/:id')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get turns for a single AI conversation' })
  @ApiParam({ name: 'id', description: 'Conversation ID (UUID)' })
  @ApiResponse({ status: 200, description: 'Conversation turns retrieved successfully' })
  async askConversationTurns(
    @Param(new ZodValidationPipe(conversationIdParamSchema, 'invalid_conversation_id')) params: ConversationIdParam,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const turns = await this.getAskConversationTurnsUseCase.execute(params.id, user.id);
    return {
      ok: true,
      turns,
    };
  }

  @Get('history')
  @UseGuards(ScopeGuard)
  @Scoped({ project: 'optional', allowAllProjects: true })
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get AI conversation history' })
  @ApiResponse({ status: 200, description: 'Conversation history retrieved successfully' })
  async askHistory(
    @Query(new ZodValidationPipe(askHistoryQuerySchema, 'invalid_ask_history_query')) query: AskHistoryQuery,
    @CurrentUser() user: AuthenticatedUser,
    @Scope() scope?: WorkspaceScope,
  ) {
    return {
      ok: true,
      ...paginatedResponse('history', await this.listAskHistoryUseCase.execute(user.id, {
        page: query.page,
        pageSize: query.pageSize,
        projectId: normalizeScopeId(scope?.projectId),
      })),
    };
  }
}
