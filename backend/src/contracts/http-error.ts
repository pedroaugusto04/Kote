export type ApiErrorDetails = Record<string, unknown>;

export type ApiErrorPayload = {
  code: string;
  message: string;
  details: ApiErrorDetails;
};

export type ApiErrorResponse = {
  ok: false;
  error: ApiErrorPayload;
  requestId: string;
};
