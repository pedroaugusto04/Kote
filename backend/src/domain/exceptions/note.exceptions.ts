import {
  DomainRuleException,
  ResourceNotFoundException,
} from './app.exception.js';
import { AppErrorCode } from './error-codes.js';

export class NoteNotFoundException extends ResourceNotFoundException {
  constructor() {
    super(AppErrorCode.NoteNotFound);
  }
}

export class NoteNotAiSessionException extends DomainRuleException {
  constructor() {
    super(AppErrorCode.NoteNotAiSession);
  }
}

export class AttachmentNotFoundException extends ResourceNotFoundException {
  constructor() {
    super(AppErrorCode.AttachmentNotFound);
  }
}

export class CommitOrNoteNotFoundException extends ResourceNotFoundException {
  constructor() {
    super(AppErrorCode.CommitOrNoteNotFound);
  }
}

export class ReminderNotFoundException extends ResourceNotFoundException {
  constructor() {
    super(AppErrorCode.ReminderNotFound);
  }
}

export class ReviewNotFoundException extends ResourceNotFoundException {
  constructor() {
    super(AppErrorCode.ReviewNotFound);
  }
}
