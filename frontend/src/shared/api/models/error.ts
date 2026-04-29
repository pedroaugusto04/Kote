export type ApiErrorDetails = Record<string, unknown> & {
  fieldErrors?: Record<string, string>;
};

export type ApiErrorPayload = {
  code: string;
  message: string;
  details: ApiErrorDetails;
};

export type ApiErrorEnvelope = {
  ok: false;
  error: ApiErrorPayload;
  requestId: string;
};

export class ApiClientError extends Error {
  readonly status: number;
  readonly code: string;
  readonly requestId: string;
  readonly details: ApiErrorDetails;

  constructor(input: {
    status: number;
    code: string;
    message: string;
    requestId?: string;
    details?: ApiErrorDetails;
  }) {
    super(input.message);
    this.name = 'ApiClientError';
    this.status = input.status;
    this.code = input.code;
    this.requestId = input.requestId || '';
    this.details = input.details || {};
  }
}

export function isApiErrorEnvelope(value: unknown): value is ApiErrorEnvelope {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Record<string, unknown>;
  const error = candidate.error as Record<string, unknown> | undefined;
  return candidate.ok === false
    && typeof candidate.requestId === 'string'
    && Boolean(error)
    && typeof error.code === 'string'
    && typeof error.message === 'string'
    && typeof error.details === 'object'
    && error.details !== null
    && !Array.isArray(error.details);
}
