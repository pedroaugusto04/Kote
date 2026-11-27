import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Res, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiParam } from '@nestjs/swagger';
import type { Response } from 'express';

import type { AuthenticatedUser } from '../../../../application/services/auth/auth.service.js';
import { AttachmentNotFoundException, NoteNotFoundException } from '../../../../domain/exceptions/index.js';
import {
  CreateManualNoteUseCase,
  DeleteNoteUseCase,
  GetNoteAttachmentContentUseCase,
  UpdateNoteUseCase,
  BulkUpdateNoteStatusUseCase,
  SetNotePinnedUseCase,
  GetAutoActionGlobalUseCase,
  SetAutoActionGlobalUseCase,
  GetNoteDetailUseCase,
  ListPaginatedNotesUseCase,
} from '../../../../application/use-cases/index.js';
import { AccessTokenAuthGuard, BrowserExtensionGuard, TrustedOriginGuard } from '../../guards/auth.guards.js';
import { CurrentUser } from '../../auth.decorators.js';
import {
  createNoteBodySchema,
  noteAttachmentContentParamSchema,
  noteIdParamSchema,
  updateNoteBodySchema,
  autoActionGlobalSchema,
  pinNoteBodySchema,
  bulkUpdateNoteStatusBodySchema,
  notesListQuerySchema,
  type CreateNoteBody,
  type AutoActionGlobal,
  type NoteAttachmentContentParam,
  type NoteIdParam,
  type UpdateNoteBody,
  type PinNoteBody,
  type BulkUpdateNoteStatusBody,
  type NotesListQuery,
} from '../../dto/note.dto.js';
import { ZodValidationPipe } from '../../zod-validation.pipe.js';
import { attachmentContentDisposition, inlineContentDisposition, paginatedResponse } from '../../http-helpers.js';
import { isZipAttachmentMimeType } from '../../../../domain/constants/attachment.constants.js';
import { ScopeGuard } from '../../guards/scope.guard.js';
import { Scoped, Scope } from '../../scope.decorators.js';
import type { WorkspaceScope } from '../../../../application/models/workspace-scope.models.js';
import {
  toCreateManualNoteDto,
  toUpdateNoteDto,
  toSetAutoActionGlobalInput,
} from '../../mappers/note.mapper.js';

@ApiTags('Notes')
@Controller('api/notes')
@UseGuards(AccessTokenAuthGuard)
export class NotesController {
  constructor(
    private readonly createManualNote: CreateManualNoteUseCase,
    private readonly updateNote: UpdateNoteUseCase,
    private readonly deleteNote: DeleteNoteUseCase,
    private readonly getAttachmentContent: GetNoteAttachmentContentUseCase,
    private readonly setNotePinnedUseCase: SetNotePinnedUseCase,
    private readonly getAutoActionGlobalUseCase: GetAutoActionGlobalUseCase,
    private readonly setAutoActionGlobalUseCase: SetAutoActionGlobalUseCase,
    private readonly bulkUpdateNoteStatus: BulkUpdateNoteStatusUseCase,
    private readonly getNoteDetail: GetNoteDetailUseCase,
    private readonly listNotesUseCase: ListPaginatedNotesUseCase,
  ) { }

  @Post()
  @UseGuards(BrowserExtensionGuard, ScopeGuard)
  @Scoped({ project: 'required' })
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create a manual note' })
  @ApiResponse({ status: 201, description: 'Note created successfully' })
  @ApiResponse({ status: 400, description: 'Invalid request body' })
  create(
    @Body(new ZodValidationPipe(createNoteBodySchema, 'invalid_create_note_payload')) body: CreateNoteBody,
    @CurrentUser() user: AuthenticatedUser,
    @Scope() scope?: WorkspaceScope,
  ) {
    const dto = toCreateManualNoteDto(body, scope?.projectId || undefined);
    return this.createManualNote.execute(dto, user.id);
  }

  @Patch('bulk/status')
  @UseGuards(TrustedOriginGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Bulk update note statuses' })
  @ApiResponse({ status: 200, description: 'Note statuses updated successfully' })
  bulkUpdateStatus(
    @Body(new ZodValidationPipe(bulkUpdateNoteStatusBodySchema, 'invalid_bulk_update_note_status_payload')) body: BulkUpdateNoteStatusBody,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.bulkUpdateNoteStatus.execute({
      userId: user.id,
      ids: body.ids,
      status: body.status,
    });
  }

  @Patch(':id')
  @UseGuards(TrustedOriginGuard, ScopeGuard)
  @Scoped({ project: 'optional' })
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update a note' })
  @ApiParam({ name: 'id', description: 'Note ID' })
  @ApiResponse({ status: 200, description: 'Note updated successfully' })
  @ApiResponse({ status: 404, description: 'Note not found' })
  update(
    @Param(new ZodValidationPipe(noteIdParamSchema, 'invalid_note_id')) params: NoteIdParam,
    @Body(new ZodValidationPipe(updateNoteBodySchema, 'invalid_update_note_payload')) body: UpdateNoteBody,
    @CurrentUser() user: AuthenticatedUser,
    @Scope() scope?: WorkspaceScope,
  ) {
    const dto = toUpdateNoteDto(body, params.id, scope?.projectId || undefined);
    return this.updateNote.execute(dto, user.id);
  }

  @Delete(':id')
  @UseGuards(TrustedOriginGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Delete a note' })
  @ApiParam({ name: 'id', description: 'Note ID' })
  @ApiResponse({ status: 200, description: 'Note deleted successfully' })
  @ApiResponse({ status: 404, description: 'Note not found' })
  remove(
    @Param(new ZodValidationPipe(noteIdParamSchema, 'invalid_note_id')) params: NoteIdParam,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.deleteNote.execute(params.id, user.id);
  }

  @Get(':noteId/attachments/:attachmentId/content')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get note attachment content' })
  @ApiParam({ name: 'noteId', description: 'Note ID' })
  @ApiParam({ name: 'attachmentId', description: 'Attachment ID' })
  @ApiResponse({ status: 200, description: 'Attachment content retrieved' })
  @ApiResponse({ status: 404, description: 'Attachment not found' })
  async attachmentContent(
    @Param(new ZodValidationPipe(noteAttachmentContentParamSchema, 'invalid_note_attachment_id')) params: NoteAttachmentContentParam,
    @CurrentUser() user: AuthenticatedUser,
    @Res() response: Response,
  ) {
    const content = await this.getAttachmentContent.execute(user.id, params.noteId, params.attachmentId);
    if (!content) throw new AttachmentNotFoundException();

    response.setHeader('Content-Type', content.mimeType);
    response.setHeader('Content-Length', String(content.body.byteLength || content.sizeBytes));
    response.setHeader('Content-Disposition', isZipAttachmentMimeType(content.mimeType)
      ? attachmentContentDisposition(content.fileName)
      : inlineContentDisposition(content.fileName));
    return response.send(content.body);
  }

  @Patch(':id/pin')
  @UseGuards(TrustedOriginGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Pin or unpin a note' })
  @ApiParam({ name: 'id', description: 'Note ID' })
  @ApiResponse({ status: 200, description: 'Note pin status updated' })
  pin(
    @Param(new ZodValidationPipe(noteIdParamSchema, 'invalid_note_id')) params: NoteIdParam,
    @Body(new ZodValidationPipe(pinNoteBodySchema, 'invalid_pin_note_payload')) body: PinNoteBody,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.setNotePinnedUseCase.execute(user.id, params.id, body.pinned);
  }

  @Get('auto/global')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get global auto-action config' })
  async getAutoActionGlobal(@CurrentUser() user: AuthenticatedUser) {
    return await this.getAutoActionGlobalUseCase.execute(user.id);
  }

  @Patch('auto/global')
  @UseGuards(TrustedOriginGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Set global auto-action config' })
  async setAutoActionGlobal(
    @Body(new ZodValidationPipe(autoActionGlobalSchema, 'invalid_auto_action_global_payload')) body: AutoActionGlobal,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const input = toSetAutoActionGlobalInput(body);
    return await this.setAutoActionGlobalUseCase.execute(user.id, input);
  }

  @Get()
  @UseGuards(ScopeGuard)
  @Scoped({ project: 'optional' })
  @ApiBearerAuth()
  @ApiOperation({ summary: 'List notes' })
  @ApiResponse({ status: 200, description: 'Notes retrieved successfully' })
  async list(
    @CurrentUser() user: AuthenticatedUser,
    @Query(new ZodValidationPipe(notesListQuerySchema, 'invalid_notes_query')) query: NotesListQuery,
    @Scope() scope?: WorkspaceScope,
  ) {
    return {
      ok: true,
      ...paginatedResponse('notes', await this.listNotesUseCase.execute(user.id, {
        ...query,
        workspaceId: scope?.workspaceId || undefined,
        projectId: scope?.projectId || undefined,
      })),
    };
  }

  @Get(':id')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get note detail' })
  @ApiParam({ name: 'id', description: 'Note ID' })
  @ApiResponse({ status: 200, description: 'Note detail retrieved successfully' })
  @ApiResponse({ status: 404, description: 'Note not found' })
  async get(
    @Param(new ZodValidationPipe(noteIdParamSchema, 'invalid_note_id')) params: NoteIdParam,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const note = await this.getNoteDetail.execute(user.id, params.id);
    if (!note) throw new NoteNotFoundException();
    return { ok: true, note };
  }
}
