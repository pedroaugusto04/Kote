import {
  AuthorizationException,
  DomainRuleException,
  ExternalServiceException,
  ResourceNotFoundException,
} from './app.exception.js';
import { AppErrorCode } from './error-codes.js';

export class QuotaExceededException extends AuthorizationException {
  constructor(resourceType: string, limit: number, current: number) {
    super(AppErrorCode.QuotaExceeded, {
      clientMessage: `You have reached the limit of ${limit} for ${resourceType}. Current usage: ${current}.`,
      details: {
        resourceType,
        limit,
        current,
      },
    });
  }
}

export class PlanNotFoundException extends ResourceNotFoundException {
  constructor(clientMessage = 'Plan not found') {
    super(AppErrorCode.PlanNotFound, { clientMessage });
  }
}

export class SubscriptionNotFoundException extends ResourceNotFoundException {
  constructor(clientMessage = 'Subscription not found') {
    super(AppErrorCode.SubscriptionNotFound, { clientMessage });
  }
}

export class PaymentNotFoundException extends ResourceNotFoundException {
  constructor(clientMessage = 'Payment not found') {
    super(AppErrorCode.PaymentNotFound, { clientMessage });
  }
}

export class GatewayCustomerNotFoundException extends ResourceNotFoundException {
  constructor(clientMessage?: string) {
    super(AppErrorCode.GatewayCustomerNotFound, { clientMessage });
  }
}

export class BillingRuleException extends DomainRuleException {
  constructor(
    clientMessage: string,
    code:
      | typeof AppErrorCode.BadRequest
      | typeof AppErrorCode.ExternalReferenceMissing
      | typeof AppErrorCode.ExternalReferenceInvalid = AppErrorCode.BadRequest,
  ) {
    super(code, { clientMessage });
  }
}

export class PaymentGatewayException extends ExternalServiceException {
  constructor(
    code:
      | typeof AppErrorCode.PaymentGatewayError
      | typeof AppErrorCode.PaymentGatewayTimeout
      | typeof AppErrorCode.PaymentGatewayUnavailable
      | typeof AppErrorCode.StripePaymentFailed
      | typeof AppErrorCode.AsaasPaymentFailed,
    options: { clientMessage?: string; status?: number; provider?: string; responseBody?: string; cause?: unknown } = {},
  ) {
    super(
      code,
      {
        provider: options.provider,
        status: options.status,
        responseBody: options.responseBody,
      },
      {
        clientMessage: options.clientMessage,
        cause: options.cause,
      },
    );
  }
}
