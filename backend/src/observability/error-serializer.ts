export function serializeErrorForLog(error: unknown): Record<string, unknown> {
  if (!(error instanceof Error)) {
    return { error: String(error) };
  }

  const baseFields: Record<string, unknown> = {
    errorName: error.name,
    error: error.message,
    errorStack: error.stack,
  };
  const errorRecord = error as Error & {
    cause?: unknown;
    status?: number;
    statusText?: string;
    responseBody?: string;
    endpoint?: string;
    provider?: unknown;
    model?: string;
  };

  if (errorRecord.cause instanceof Error) {
    baseFields.errorCause = errorRecord.cause.message;
    baseFields.errorCauseStack = errorRecord.cause.stack;
  } else if (errorRecord.cause !== undefined) {
    baseFields.errorCause = String(errorRecord.cause);
  }
  if (errorRecord.status !== undefined) baseFields.errorStatus = errorRecord.status;
  if (errorRecord.statusText !== undefined) baseFields.errorStatusText = errorRecord.statusText;
  if (errorRecord.responseBody !== undefined) baseFields.errorResponseBody = errorRecord.responseBody;
  if (errorRecord.endpoint !== undefined) baseFields.errorEndpoint = errorRecord.endpoint;
  if (errorRecord.provider !== undefined) baseFields.errorProvider = String(errorRecord.provider);
  if (errorRecord.model !== undefined) baseFields.errorModel = errorRecord.model;
  return baseFields;
}
