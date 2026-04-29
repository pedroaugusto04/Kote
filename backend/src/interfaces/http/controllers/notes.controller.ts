import { Body, Controller, Post, UseGuards } from '@nestjs/common';

import type { AuthenticatedUser } from '../../../application/auth.js';
import { CreateManualNoteUseCase } from '../../../application/use-cases/notes/create-manual-note.use-case.js';
import { CurrentUser } from '../auth.decorators.js';
import { AccessTokenAuthGuard, TrustedOriginGuard } from '../auth.guards.js';
import { createNoteBodySchema, type CreateNoteBody } from '../dto/note.dto.js';
import { ZodValidationPipe } from '../zod-validation.pipe.js';

@Controller('api/notes')
@UseGuards(AccessTokenAuthGuard)
export class NotesController {
  constructor(private readonly createManualNote: CreateManualNoteUseCase) {}

  @Post()
  @UseGuards(TrustedOriginGuard)
  create(
    @Body(new ZodValidationPipe(createNoteBodySchema, 'invalid_create_note_payload')) body: CreateNoteBody,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.createManualNote.execute(body, user.id);
  }
}
