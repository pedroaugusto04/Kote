import {
  AuthenticationException,
  DomainRuleException,
  ExternalServiceException,
  ResourceConflictException,
  ResourceNotFoundException,
} from './app.exception.js';
import { AppErrorCode } from './error-codes.js';

export class ProviderNotSupportedException extends DomainRuleException {
  constructor() {
    super(AppErrorCode.ProviderNotSupported);
  }
}

export class ProviderNotFoundException extends ResourceNotFoundException {
  constructor() {
    super(AppErrorCode.ProviderNotFound);
  }
}

export class ConnectionSessionNotFoundException extends ResourceNotFoundException {
  constructor() {
    super(AppErrorCode.ConnectionSessionNotFound);
  }
}

export class InvalidConnectionStateException extends AuthenticationException {
  constructor() {
    super(AppErrorCode.InvalidConnectionState);
  }
}

export class ExternalIdentityAlreadyBoundException extends ResourceConflictException {
  constructor() {
    super(AppErrorCode.ExternalIdentityAlreadyBound);
  }
}

export class ExternalIdentityNotFoundException extends ResourceNotFoundException {
  constructor(
    code:
      | typeof AppErrorCode.IdentityNotFound
      | typeof AppErrorCode.ExternalIdentityRequired = AppErrorCode.IdentityNotFound,
  ) {
    super(code);
  }
}

export class MissingExternalIdentityException extends AuthenticationException {
  constructor() {
    super(AppErrorCode.MissingExternalIdentity);
  }
}

export class CredentialNotFoundException extends ResourceNotFoundException {
  constructor(
    code:
      | typeof AppErrorCode.CredentialNotFound
      | typeof AppErrorCode.GithubIntegrationNotFound
      | typeof AppErrorCode.GithubCredentialNotFound = AppErrorCode.CredentialNotFound,
  ) {
    super(code);
  }
}

export class GithubIntegrationException extends DomainRuleException {
  constructor(
    code:
      | typeof AppErrorCode.GithubCallbackMissingInstallation
      | typeof AppErrorCode.GithubAppInstallationNotConfigured
      | typeof AppErrorCode.GithubAppInstallUrlNotConfigured
      | typeof AppErrorCode.GithubInstallationTokenUnavailable
      | typeof AppErrorCode.GithubConnectionRequired
      | typeof AppErrorCode.GithubRepositoryNotSelected
      | typeof AppErrorCode.InvalidProjectRepositorySelection
      | typeof AppErrorCode.InvalidDependencyRepositorySelection
      | typeof AppErrorCode.RepositoriesRequired,
  ) {
    super(code);
  }
}

export class GithubAuthException extends AuthenticationException {
  constructor(
    code:
      | typeof AppErrorCode.GithubInstallationNotAccessible
      | typeof AppErrorCode.GithubWebhookSecretNotConfigured
      | typeof AppErrorCode.InvalidGithubSignature
      | typeof AppErrorCode.MissingInstallationId,
  ) {
    super(code);
  }
}

export class WebhookAuthException extends AuthenticationException {
  constructor(
    code:
      | typeof AppErrorCode.InvalidWebhookToken
      | typeof AppErrorCode.MissingWebhookSignature
      | typeof AppErrorCode.InvalidWebhookSignature
      | typeof AppErrorCode.UnauthorizedWebhook = AppErrorCode.UnauthorizedWebhook,
  ) {
    super(code);
  }
}

export class WebhookSubscriptionNotFoundException extends ResourceNotFoundException {
  constructor() {
    super(AppErrorCode.WebhookSubscriptionNotFound);
  }
}

export class PushSubscriptionNotFoundException extends ResourceNotFoundException {
  constructor() {
    super(AppErrorCode.PushSubscriptionNotFound);
  }
}

export class DependencyNotFoundException extends ResourceNotFoundException {
  constructor() {
    super(AppErrorCode.DependencyNotFound);
  }
}

export class BackfillAlreadyCompletedException extends ResourceConflictException {
  constructor() {
    super(AppErrorCode.BackfillAlreadyCompleted);
  }
}

export class JobNotFoundException extends ResourceNotFoundException {
  constructor() {
    super(AppErrorCode.JobNotFound);
  }
}

export class JobAlreadyFinishedException extends DomainRuleException {
  constructor() {
    super(AppErrorCode.JobAlreadyFinished);
  }
}

export class TelegramNotConfiguredException extends DomainRuleException {
  constructor() {
    super(AppErrorCode.TelegramBotTokenNotConfigured);
  }
}

export class RegistryException extends ExternalServiceException {
  constructor(
    code:
      | typeof AppErrorCode.RegistryRequestTimeout
      | typeof AppErrorCode.RegistryPackageNotFound
      | typeof AppErrorCode.RegistryFetchFailed,
    metadata: { registryName: string; packageName: string; status?: number; endpoint?: string },
    options: { clientMessage: string; cause?: unknown },
  ) {
    super(
      code,
      {
        provider: metadata.registryName,
        endpoint: metadata.endpoint ?? metadata.packageName,
        status: metadata.status,
      },
      options,
    );
  }
}

export class RegistryTimeoutException extends RegistryException {
  constructor(registryName: string, packageName: string, cause?: unknown) {
    super(
      AppErrorCode.RegistryRequestTimeout,
      { registryName, packageName },
      { clientMessage: `${registryName} request timeout for ${packageName}`, cause },
    );
  }
}

export class RegistryPackageNotFoundException extends RegistryException {
  constructor(registryName: string, packageName: string) {
    super(
      AppErrorCode.RegistryPackageNotFound,
      { registryName, packageName, status: 404 },
      { clientMessage: `Package ${packageName} not found in ${registryName}` },
    );
  }
}

export class RegistryFetchException extends RegistryException {
  constructor(
    registryName: string,
    packageName: string,
    detail: string,
    options: { status?: number; cause?: unknown } = {},
  ) {
    super(
      AppErrorCode.RegistryFetchFailed,
      { registryName, packageName, status: options.status },
      { clientMessage: `${registryName} fetch failed for ${packageName}: ${detail}`, cause: options.cause },
    );
  }
}

export class RegistryInvalidPackageFormatException extends DomainRuleException {
  constructor(clientMessage: string) {
    super(AppErrorCode.RegistryInvalidPackageFormat, { clientMessage });
  }
}
