import {
  ConfigurationException,
  ExternalServiceException,
  IntegrationUnavailableException,
  type ExternalServiceErrorMetadata,
} from './app.exception.js';
import { AppErrorCode } from './error-codes.js';

export type AiNotConfiguredCode =
  | typeof AppErrorCode.ReviewAiNotConfigured
  | typeof AppErrorCode.ConversationAiNotConfigured
  | typeof AppErrorCode.ProjectBriefAiNotConfigured
  | typeof AppErrorCode.FileNotesSummaryAiNotConfigured
  | typeof AppErrorCode.AiSessionSynthesisNotConfigured
  | typeof AppErrorCode.PrContextAiNotConfigured;

export type AiNotConnectedCode =
  | typeof AppErrorCode.ReviewAiNotConnected
  | typeof AppErrorCode.AiConversationNotEnabled
  | typeof AppErrorCode.ProjectBriefAiNotConnected
  | typeof AppErrorCode.FileNotesSummaryAiNotConnected
  | typeof AppErrorCode.AiSessionSynthesisNotConnected
  | typeof AppErrorCode.PrContextAiNotConnected;

export class AiNotConfiguredException extends IntegrationUnavailableException {
  constructor(code: AiNotConfiguredCode, missing: string[] = []) {
    super(code, { details: missing.length ? { missing } : {} });
  }
}

export class AiNotConnectedException extends IntegrationUnavailableException {
  constructor(code: AiNotConnectedCode) {
    super(code);
  }
}

export class ConversationAgentUnavailableException extends IntegrationUnavailableException {
  constructor() {
    super(AppErrorCode.ConversationAgentUnavailable);
  }
}

export class EmbeddingStrategyNotAvailableException extends ConfigurationException {
  constructor(details?: Record<string, unknown>) {
    super(AppErrorCode.EmbeddingStrategyNotAvailable, { details });
  }
}

export class AiExecutionException extends ExternalServiceException {
  constructor(
    message: string,
    metadata: ExternalServiceErrorMetadata = {},
    cause?: unknown,
  ) {
    super(AppErrorCode.InternalServerError, metadata, { cause });
    this.message = message;
  }
}
