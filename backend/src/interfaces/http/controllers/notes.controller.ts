import { Body, Controller, Delete, Param, Patch, Post, UseGuards } from '@nestjs/common';

import type { AuthenticatedUser } from '../../../application/auth.js';
import { CreateManualNoteUseCase, DeleteManualNoteUseCase, UpdateManualNoteUseCase } from '../../../application/use-cases/index.js';
import { CurrentUser } from '../auth.decorators.js';
import { AccessTokenAuthGuard, TrustedOriginGuard } from '../auth.guards.js';
import { createNoteBodySchema, noteIdParamSchema, updateNoteBodySchema, type CreateNoteBody, type NoteIdParam, type UpdateNoteBody } from '../dto/note.dto.js';
import { ZodValidationPipe } from '../zod-validation.pipe.js';

@Controller('api/notes')
@UseGuards(AccessTokenAuthGuard)
export class NotesController {
  constructor(
    private readonly createManualNote: CreateManualNoteUseCase,
    private readonly updateManualNote: UpdateManualNoteUseCase,
    private readonly deleteManualNote: DeleteManualNoteUseCase,
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
    return this.updateManualNote.execute({ ...body, id: params.id }, user.id);
  }

  @Delete(':id')
  @UseGuards(TrustedOriginGuard)
  remove(
    @Param(new ZodValidationPipe(noteIdParamSchema, 'invalid_note_id')) params: NoteIdParam,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.deleteManualNote.execute(params.id, user.id);
  }
}
