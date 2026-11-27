import {
  AuthenticationException,
  AuthorizationException,
  ConfigurationException,
  DomainRuleException,
  ResourceConflictException,
  ResourceNotFoundException,
} from './app.exception.js';
import { AppErrorCode } from './error-codes.js';

export class CurrentUserMissingException extends AuthenticationException {
  constructor() {
    super(AppErrorCode.CurrentUserMissing);
  }
}

export class MissingAccessTokenException extends AuthenticationException {
  constructor() {
    super(AppErrorCode.MissingAccessToken);
  }
}

export class InvalidTokenException extends AuthenticationException {
  constructor(code: typeof AppErrorCode.InvalidToken | typeof AppErrorCode.InvalidTokenType | typeof AppErrorCode.InvalidConnectionToken = AppErrorCode.InvalidToken) {
    super(code);
  }
}

export class TokenExpiredException extends AuthenticationException {
  constructor() {
    super(AppErrorCode.TokenExpired);
  }
}

export class JwtSecretNotConfiguredException extends ConfigurationException {
  constructor() {
    super(AppErrorCode.JwtSecretNotConfigured);
  }
}

export class UserNotFoundException extends AuthenticationException {
  constructor() {
    super(AppErrorCode.UserNotFound);
  }
}

export class InvalidCredentialsException extends AuthenticationException {
  constructor() {
    super(AppErrorCode.InvalidCredentials);
  }
}

export class InvalidSignupException extends AuthenticationException {
  constructor() {
    super(AppErrorCode.InvalidSignup);
  }
}

export class EmailAlreadyRegisteredException extends ResourceConflictException {
  constructor(fieldMessage = 'This email is already registered.') {
    super(AppErrorCode.EmailAlreadyRegistered, {
      details: { fieldErrors: { email: fieldMessage } },
    });
  }
}

export class InvalidOriginException extends AuthorizationException {
  constructor() {
    super(AppErrorCode.InvalidOrigin);
  }
}

export class InvalidHostHeaderException extends DomainRuleException {
  constructor() {
    super(AppErrorCode.InvalidHostHeader);
  }
}

export class InvalidInternalTokenException extends AuthenticationException {
  constructor() {
    super(AppErrorCode.InvalidInternalToken);
  }
}

export class GoogleOAuthException extends AuthenticationException {
  constructor(
    code:
      | typeof AppErrorCode.GoogleAuthFailed
      | typeof AppErrorCode.GoogleEmailNotVerified
      | typeof AppErrorCode.InvalidGoogleOAuthState,
  ) {
    super(code);
  }
}

export class GoogleOAuthNotConfiguredException extends DomainRuleException {
  constructor(
    code:
      | typeof AppErrorCode.GoogleOAuthNotConfigured
      | typeof AppErrorCode.GoogleOAuthRedirectUriNotConfigured = AppErrorCode.GoogleOAuthNotConfigured,
  ) {
    super(code);
  }
}

export class ReturnToPathMustBeRelativeException extends DomainRuleException {
  constructor() {
    super(AppErrorCode.ReturnToPathMustBeRelative);
  }
}

export class AvatarValidationException extends DomainRuleException {
  constructor(
    code:
      | typeof AppErrorCode.AvatarFileRequired
      | typeof AppErrorCode.UnsupportedAvatarType
      | typeof AppErrorCode.AvatarFileTooLarge,
  ) {
    super(code);
  }
}

export class AvatarNotFoundException extends ResourceNotFoundException {
  constructor() {
    super(AppErrorCode.AvatarNotFound);
  }
}

export class TestEmailAuthException extends AuthenticationException {
  constructor() {
    super(AppErrorCode.InvalidTestEmailAuth);
  }
}

export class TestEmailAuthNotConfiguredException extends DomainRuleException {
  constructor() {
    super(AppErrorCode.TestEmailAuthNotConfigured);
  }
}
