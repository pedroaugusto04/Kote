import { Body, Controller, Delete, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiParam, ApiQuery } from '@nestjs/swagger';

import type { AuthenticatedUser } from '../../../../application/services/auth/auth.service.js';
import { GitCommitService } from '../../../../application/services/projects/git-commit.service.js';
import {
  FindRelatedNotesUseCase,
  FindNotesByFileUseCase,
  FindNotesBySnippetUseCase,
  FindRelatedNotesByFileUseCase,
  GenerateFileNotesSummaryByFileUseCase,
  RequestAiSessionSynthesisUseCase,
  GenerateSessionHandoffUseCase,
} from '../../../../application/use-cases/index.js';
import { CurrentUser } from '../../auth.decorators.js';
import { AccessTokenAuthGuard, TrustedOriginGuard } from '../../guards/auth.guards.js';
import {
  noteIdParamSchema,
  notesByFileQuerySchema,
  fileNotesSummaryQuerySchema,
  relatedNotesByFileQuerySchema,
  notesBySnippetQuerySchema,
  notesBySnippetBodySchema,
  linkNoteCommitBodySchema,
  noteCommitParamSchema,
  type NoteIdParam,
  type NotesByFileQuery,
  type FileNotesSummaryQuery,
  type RelatedNotesByFileQuery,
  type NotesBySnippetQuery,
  type NotesBySnippetBody,
  type LinkNoteCommitBody,
  type NoteCommitParam,
} from '../../dto/note.dto.js';
import {
  sessionHandoffBodySchema,
  type SessionHandoffBody,
} from '../../dto/session-handoff.dto.js';
import { ZodValidationPipe } from '../../zod-validation.pipe.js';
import { ScopeGuard } from '../../guards/scope.guard.js';
import { Scoped, Scope } from '../../scope.decorators.js';
import type { WorkspaceScope } from '../../../../application/models/workspace-scope.models.js';
import {
  toFindNotesBySnippetInput,
  toFindRelatedNotesByFileInput,
  toGenerateFileNotesSummaryInput,
  toFindNotesByFileOptions,
} from '../../mappers/note.mapper.js';

@ApiTags('Notes')
@Controller('api/notes')
@UseGuards(AccessTokenAuthGuard)
export class NoteIntelligenceController {
  constructor(
    private readonly findRelatedNotesUseCase: FindRelatedNotesUseCase,
    private readonly findNotesByFileUseCase: FindNotesByFileUseCase,
    private readonly findNotesBySnippetUseCase: FindNotesBySnippetUseCase,
    private readonly findRelatedNotesByFileUseCase: FindRelatedNotesByFileUseCase,
    private readonly generateFileNotesSummaryByFileUseCase: GenerateFileNotesSummaryByFileUseCase,
    private readonly requestAiSessionSynthesis: RequestAiSessionSynthesisUseCase,
    private readonly generateSessionHandoffUseCase: GenerateSessionHandoffUseCase,
    private readonly gitCommitService: GitCommitService,
  ) { }

  @Get('by-file')
  @UseGuards(ScopeGuard)
  @Scoped({ project: 'optional' })
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Find notes by file path' })
  @ApiQuery({ name: 'filePath', description: 'Relative file path to search notes for' })
  @ApiResponse({ status: 200, description: 'Notes matching the file path retrieved successfully' })
  async findByFile(
    @Query(new ZodValidationPipe(notesByFileQuerySchema, 'invalid_notes_by_file_query')) query: NotesByFileQuery,
    @CurrentUser() user: AuthenticatedUser,
    @Scope() scope?: WorkspaceScope,
  ) {
    const options = toFindNotesByFileOptions(query, scope);
    return this.findNotesByFileUseCase.execute(user.id, query.filePath, options);
  }

  @Get('by-file/related')
  @UseGuards(ScopeGuard)
  @Scoped({ project: 'optional' })
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Find related notes by file path' })
  @ApiQuery({ name: 'filePath', description: 'Relative file path to search related notes for' })
  @ApiQuery({ name: 'excludeIds', description: 'IDs of notes to exclude (comma separated)', required: false })
  @ApiQuery({ name: 'limit', description: 'Maximum number of notes to return', required: false })
  @ApiQuery({ name: 'searchProfile', enum: ['file', 'snippet'], required: false })
  @ApiResponse({ status: 200, description: 'Related notes retrieved successfully' })
  async findRelatedByFile(
    @Query(new ZodValidationPipe(relatedNotesByFileQuerySchema, 'invalid_related_notes_by_file_query')) query: RelatedNotesByFileQuery,
    @CurrentUser() user: AuthenticatedUser,
    @Scope() scope?: WorkspaceScope,
  ) {
    const input = toFindRelatedNotesByFileInput(query, user.id, scope);
    return this.findRelatedNotesByFileUseCase.execute(input);
  }

  @Get('by-file/summary')
  @UseGuards(ScopeGuard)
  @Scoped({ project: 'optional' })
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Generate AI summary of notes for a file' })
  @ApiQuery({ name: 'filePath', description: 'Relative file path to generate summary for' })
  @ApiResponse({ status: 200, description: 'AI summary generated successfully' })
  async getFileNotesSummary(
    @Query(new ZodValidationPipe(fileNotesSummaryQuerySchema, 'invalid_file_notes_summary_query')) query: FileNotesSummaryQuery,
    @CurrentUser() user: AuthenticatedUser,
    @Scope() scope?: WorkspaceScope,
  ) {
    const input = toGenerateFileNotesSummaryInput(query, scope);
    return this.generateFileNotesSummaryByFileUseCase.execute(user.id, input);
  }

  @Get('by-snippet')
  @UseGuards(ScopeGuard)
  @Scoped({ project: 'optional' })
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Find notes and AI sessions related to a code snippet and commit' })
  @ApiResponse({ status: 200, description: 'Notes for snippet retrieved successfully' })
  async getBySnippet(
    @Query(new ZodValidationPipe(notesBySnippetQuerySchema, 'invalid_notes_by_snippet_query')) query: NotesBySnippetQuery,
    @CurrentUser() user: AuthenticatedUser,
    @Scope() scope?: WorkspaceScope,
  ) {
    const input = toFindNotesBySnippetInput(query, scope?.projectSlug, scope?.workspaceSlug);
    return this.findNotesBySnippetUseCase.execute(user.id, input);
  }

  @Post('by-snippet')
  @UseGuards(ScopeGuard)
  @Scoped({ project: 'optional' })
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Find notes and AI sessions related to a code snippet and commit (POST)' })
  @ApiResponse({ status: 200, description: 'Notes for snippet retrieved successfully' })
  async postBySnippet(
    @Body(new ZodValidationPipe(notesBySnippetBodySchema, 'invalid_notes_by_snippet_payload')) body: NotesBySnippetBody,
    @CurrentUser() user: AuthenticatedUser,
    @Scope() scope?: WorkspaceScope,
  ) {
    const input = toFindNotesBySnippetInput(body, scope?.projectSlug, scope?.workspaceSlug);
    return this.findNotesBySnippetUseCase.execute(user.id, input);
  }

  @Post('session-handoff')
  @UseGuards(TrustedOriginGuard, ScopeGuard)
  @Scoped({ project: 'optional' })
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Generate or retrieve on-demand session handoff' })
  @ApiResponse({ status: 200, description: 'Session handoff generated successfully' })
  async sessionHandoff(
    @Body(new ZodValidationPipe(sessionHandoffBodySchema, 'invalid_session_handoff_payload')) body: SessionHandoffBody,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.generateSessionHandoffUseCase.execute(user.id, body);
  }

  @Get(':id/related')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Find related notes' })
  @ApiParam({ name: 'id', description: 'Note ID' })
  @ApiResponse({ status: 200, description: 'Related notes retrieved' })
  related(
    @Param(new ZodValidationPipe(noteIdParamSchema, 'invalid_note_id')) params: NoteIdParam,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.findRelatedNotesUseCase.execute(user.id, params.id);
  }

  @Post(':id/synthesis')
  @UseGuards(TrustedOriginGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Request immediate AI session synthesis' })
  @ApiParam({ name: 'id', description: 'AI session note ID' })
  @ApiResponse({ status: 200, description: 'Synthesis queued for immediate processing' })
  requestSynthesis(
    @Param(new ZodValidationPipe(noteIdParamSchema, 'invalid_note_id')) params: NoteIdParam,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.requestAiSessionSynthesis.execute(user.id, params.id);
  }

  @Post(':id/commits')
  @UseGuards(TrustedOriginGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Manually link a Git commit to a note' })
  @ApiParam({ name: 'id', description: 'Note ID' })
  @ApiResponse({ status: 200, description: 'Commit linked to note successfully' })
  async linkCommit(
    @Param(new ZodValidationPipe(noteIdParamSchema, 'invalid_note_id')) params: NoteIdParam,
    @Body(new ZodValidationPipe(linkNoteCommitBodySchema, 'invalid_link_note_commit_payload')) body: LinkNoteCommitBody,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const commit = await this.gitCommitService.linkCommitToNote(user.id, params.id, body.commitId);
    return { ok: true, commit };
  }

  @Delete(':id/commits/:commitId')
  @UseGuards(TrustedOriginGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Unlink a Git commit from a note' })
  @ApiParam({ name: 'id', description: 'Note ID' })
  @ApiParam({ name: 'commitId', description: 'Commit ID' })
  @ApiResponse({ status: 200, description: 'Commit unlinked from note successfully' })
  async unlinkCommit(
    @Param(new ZodValidationPipe(noteCommitParamSchema, 'invalid_note_commit_id')) params: NoteCommitParam,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const removed = await this.gitCommitService.unlinkCommitFromNote(user.id, params.id, params.commitId);
    return { ok: true, removed };
  }
}
