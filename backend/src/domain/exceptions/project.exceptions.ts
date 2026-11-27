import {
  DomainRuleException,
  ExternalServiceException,
  ResourceConflictException,
  ResourceNotFoundException,
} from './app.exception.js';
import { AppErrorCode } from './error-codes.js';

export class ProjectNotFoundException extends ResourceNotFoundException {
  constructor() {
    super(AppErrorCode.ProjectNotFound);
  }
}

export class ProjectSlugMissingException extends ResourceNotFoundException {
  constructor() {
    super(AppErrorCode.ProjectSlugMissing);
  }
}

export class ProjectSlugAlreadyExistsException extends ResourceConflictException {
  constructor() {
    super(AppErrorCode.ProjectSlugAlreadyExists);
  }
}

export class ProjectHasNotesException extends DomainRuleException {
  constructor() {
    super(AppErrorCode.ProjectHasNotes);
  }
}

export class FolderNotFoundException extends ResourceNotFoundException {
  constructor(
    code:
      | typeof AppErrorCode.FolderNotFound
      | typeof AppErrorCode.ProjectFolderNotFound
      | typeof AppErrorCode.FolderParentNotFound = AppErrorCode.FolderNotFound,
  ) {
    super(code);
  }
}

export class FolderSlugAlreadyExistsException extends ResourceConflictException {
  constructor() {
    super(AppErrorCode.FolderSlugAlreadyExists);
  }
}

export class FolderHasNotesException extends DomainRuleException {
  constructor() {
    super(AppErrorCode.FolderHasNotes);
  }
}

export class FolderNotEmptyException extends DomainRuleException {
  constructor() {
    super(AppErrorCode.FolderNotEmpty);
  }
}

export class FolderCycleNotAllowedException extends DomainRuleException {
  constructor() {
    super(AppErrorCode.FolderCycleNotAllowed);
  }
}

export class ProjectBriefGenerationFailedException extends ExternalServiceException {
  constructor(cause?: unknown) {
    super(AppErrorCode.ProjectBriefGenerationFailed, {}, { cause });
  }
}
