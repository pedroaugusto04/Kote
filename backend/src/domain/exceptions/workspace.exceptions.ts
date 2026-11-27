import {
  DomainRuleException,
  ResourceConflictException,
  ResourceNotFoundException,
} from './app.exception.js';
import { AppErrorCode } from './error-codes.js';

export class WorkspaceNotFoundException extends ResourceNotFoundException {
  constructor() {
    super(AppErrorCode.WorkspaceNotFound);
  }
}

export class WorkspaceSlugRequiredException extends DomainRuleException {
  constructor() {
    super(AppErrorCode.WorkspaceSlugRequired);
  }
}

export class WorkspaceSlugMissingException extends ResourceNotFoundException {
  constructor() {
    super(AppErrorCode.WorkspaceSlugMissing);
  }
}

export class WorkspaceSlugAlreadyExistsException extends ResourceConflictException {
  constructor() {
    super(AppErrorCode.WorkspaceSlugAlreadyExists);
  }
}
