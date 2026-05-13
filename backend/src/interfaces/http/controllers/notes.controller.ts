import { Body, Controller, Delete, Get, NotFoundException, Param, Patch, Post, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';

import type { AuthenticatedUser } from '../../../application/auth.js';
import { CreateManualNoteUseCase, DeleteNoteUseCase, GetNoteAttachmentContentUseCase, UpdateNoteUseCase } from '../../../application/use-cases/index.js';
import { CurrentUser } from '../auth.decorators.js';
import { AccessTokenAuthGuard, TrustedOriginGuard } from '../auth.guards.js';
import {
  createNoteBodySchema,
  noteAttachmentContentParamSchema,
  noteIdParamSchema,
  updateNoteBodySchema,
  type CreateNoteBody,
  type NoteAttachmentContentParam,
  type NoteIdParam,
  type UpdateNoteBody,
} from '../dto/note.dto.js';
import { ZodValidationPipe } from '../zod-validation.pipe.js';

@Controller('api/notes')
@UseGuards(AccessTokenAuthGuard)
export class NotesController {
  constructor(
    private readonly createManualNote: CreateManualNoteUseCase,
    private readonly updateNote: UpdateNoteUseCase,
    private readonly deleteNote: DeleteNoteUseCase,
    private readonly getAttachmentContent: GetNoteAttachmentContentUseCase,
  ) {}

  @Post()
  @UseGuards(TrustedOriginGuard)
  create(
    @Body(new ZodValidationPipe(createNoteBodySchema, 'invalid_create_note_payload')) body: CreateNoteBody,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.createManualNote.execute(body, user.id);
  }

  @Patch(':id')
  @UseGuards(TrustedOriginGuard)
  update(
    @Param(new ZodValidationPipe(noteIdParamSchema, 'invalid_note_id')) params: NoteIdParam,
    @Body(new ZodValidationPipe(updateNoteBodySchema, 'invalid_update_note_payload')) body: UpdateNoteBody,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.updateNote.execute({ ...body, id: params.id }, user.id);
  }

  @Delete(':id')
  @UseGuards(TrustedOriginGuard)
  remove(
    @Param(new ZodValidationPipe(noteIdParamSchema, 'invalid_note_id')) params: NoteIdParam,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.deleteNote.execute(params.id, user.id);
  }

  @Get(':noteId/attachments/:attachmentId/content')
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
}

function inlineContentDisposition(fileName: string) {
  const fallbackName = (fileName || 'attachment').replace(/[\\/\u0000-\u001f\u007f"]/g, '_');
  return `inline; filename="${fallbackName}"; filename*=UTF-8''${encodeURIComponent(fileName || 'attachment')}`;
}
