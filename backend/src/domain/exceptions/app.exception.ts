import type { AppErrorCode } from './error-codes.js';

export type AppExceptionOptions = {
  details?: Record<string, unknown>;
  clientMessage?: string;
  cause?: unknown;
};

/**
 * Base class for all typed domain and application exceptions.
 * Protocol-agnostic: HTTP status mapping is centralized in GlobalExceptionFilter.
 */
export abstract class AppException extends Error {
  readonly code: AppErrorCode;
  readonly details: Record<string, unknown>;
  readonly clientMessage?: string;

  protected constructor(code: AppErrorCode, options: AppExceptionOptions = {}) {
    super(options.clientMessage ?? code, options.cause !== undefined ? { cause: options.cause } : undefined);
    this.name = new.target.name;
    this.code = code;
    this.details = options.details ?? {};
    this.clientMessage = options.clientMessage;
  }
}

export class ResourceNotFoundException extends AppException {
  constructor(code: AppErrorCode, options: AppExceptionOptions = {}) {
    super(code, options);
  }
}

export class DomainRuleException extends AppException {
  constructor(code: AppErrorCode, options: AppExceptionOptions = {}) {
    super(code, options);
  }
}

export class ResourceConflictException extends AppException {
  constructor(code: AppErrorCode, options: AppExceptionOptions = {}) {
    super(code, options);
  }
}

export class AuthenticationException extends AppException {
  constructor(code: AppErrorCode, options: AppExceptionOptions = {}) {
    super(code, options);
  }
}

export class AuthorizationException extends AppException {
  constructor(code: AppErrorCode, options: AppExceptionOptions = {}) {
    super(code, options);
  }
}

export class ValidationException extends AppException {
  constructor(code: AppErrorCode, details: Record<string, unknown> = {}, clientMessage?: string) {
    super(code, { details, clientMessage });
  }
}

export class IntegrationUnavailableException extends AppException {
  constructor(code: AppErrorCode, options: AppExceptionOptions = {}) {
    super(code, options);
  }
}

export type ExternalServiceErrorMetadata = {
  provider?: string;
  model?: string;
  endpoint?: string;
  status?: number;
  statusText?: string;
  responseBody?: string;
  retryAfterMs?: number;
};

export class ExternalServiceException extends AppException {
  readonly provider?: string;
  readonly model?: string;
  readonly endpoint?: string;
  readonly status?: number;
  readonly statusText?: string;
  readonly responseBody?: string;
  readonly retryAfterMs?: number;

  constructor(
    code: AppErrorCode,
    metadata: ExternalServiceErrorMetadata = {},
    options: AppExceptionOptions = {},
  ) {
    super(code, options);
    this.provider = metadata.provider;
    this.model = metadata.model;
    this.endpoint = metadata.endpoint;
    this.status = metadata.status;
    this.statusText = metadata.statusText;
    this.responseBody = metadata.responseBody;
    this.retryAfterMs = metadata.retryAfterMs;
  }
}

export class ConfigurationException extends AppException {
  constructor(code: AppErrorCode, options: AppExceptionOptions = {}) {
    super(code, options);
  }
}
