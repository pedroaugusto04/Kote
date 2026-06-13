import { Body, Controller, Delete, Get, NotFoundException, Param, Patch, Post, Res, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiParam, ApiBody } from '@nestjs/swagger';
import type { Response } from 'express';

import type { AuthenticatedUser } from '../../../../application/auth.js';
import {
  CreateManualNoteUseCase,
  DeleteNoteUseCase,
  GetNoteAttachmentContentUseCase,
  UpdateNoteUseCase,
  SetNotePinnedUseCase,
  FindRelatedNotesUseCase,
} from '../../../../application/use-cases/index.js';
import { CurrentUser } from '../../auth.decorators.js';
import { AccessTokenAuthGuard, TrustedOriginGuard } from '../../auth.guards.js';
import {
  createNoteBodySchema,
  noteAttachmentContentParamSchema,
  noteIdParamSchema,
  updateNoteBodySchema,
  pinNoteBodySchema,
  type CreateNoteBody,
  type NoteAttachmentContentParam,
  type NoteIdParam,
  type UpdateNoteBody,
  type PinNoteBody,
} from '../../dto/note.dto.js';
import { ZodValidationPipe } from '../../zod-validation.pipe.js';

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
    private readonly findRelatedNotesUseCase: FindRelatedNotesUseCase,
  ) {}

  @Post()
  @UseGuards(TrustedOriginGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create a manual note' })
  @ApiResponse({ status: 201, description: 'Note created successfully' })
  @ApiResponse({ status: 400, description: 'Invalid request body' })
  create(
    @Body(new ZodValidationPipe(createNoteBodySchema, 'invalid_create_note_payload')) body: CreateNoteBody,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.createManualNote.execute(body, user.id);
  }

  @Patch(':id')
  @UseGuards(TrustedOriginGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update a note' })
  @ApiParam({ name: 'id', description: 'Note ID' })
  @ApiResponse({ status: 200, description: 'Note updated successfully' })
  @ApiResponse({ status: 404, description: 'Note not found' })
  update(
    @Param(new ZodValidationPipe(noteIdParamSchema, 'invalid_note_id')) params: NoteIdParam,
    @Body(new ZodValidationPipe(updateNoteBodySchema, 'invalid_update_note_payload')) body: UpdateNoteBody,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.updateNote.execute({ ...body, id: params.id }, user.id);
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
    if (!content) throw new NotFoundException('attachment_not_found');

    response.setHeader('Content-Type', content.mimeType);
    response.setHeader('Content-Length', String(content.body.byteLength || content.sizeBytes));
    response.setHeader('Content-Disposition', inlineContentDisposition(content.fileName));
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
}

function inlineContentDisposition(fileName: string) {
  const fallbackName = (fileName || 'attachment').replace(/[\\/\u0000-\u001f\u007f"]/g, '_');
  return `inline; filename="${fallbackName}"; filename*=UTF-8''${encodeURIComponent(fileName || 'attachment')}`;
}
