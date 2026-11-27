import { randomUUID } from 'node:crypto';

import { type ArgumentsHost, Catch, type ExceptionFilter, HttpException, HttpStatus, Injectable } from '@nestjs/common';
import type { Request, Response } from 'express';

import type { ApiErrorDetails, ApiErrorResponse } from '../contracts/http-error.js';
import { AppException } from '../domain/exceptions/app.exception.js';
import { isRecord } from '../domain/utils/type-guards.utils.js';
import { serializeErrorForLog } from './error-serializer.js';
import { resolveHttpErrorCode, httpErrorCatalog, isKnownHttpErrorCode, type HttpErrorCode } from './http-error-catalog.js';
import { AppLogger } from './logger.js';
import { HttpErrorLogLevel } from './observability.enums.js';
import { getRequestContext, updateRequestContext } from './request-context.js';
import { getRequestMetadata } from './request-metadata.js';

type HttpExceptionResponse = string | {
  code?: string;
  message?: string | string[];
  details?: Record<string, unknown>;
  error?: string;
  statusCode?: number;
};

type NormalizedException = {
  code: HttpErrorCode;
  statusCode: number;
  details: ApiErrorDetails;
  safeMessage: string;
  logLevel: HttpErrorLogLevel;
};

function normalizeDetails(details: unknown): ApiErrorDetails {
  return isRecord(details) ? details : {};
}

function extractHttpExceptionPayload(error: HttpException): { code?: string; statusCode: number; details: ApiErrorDetails } {
  const statusCode = error.getStatus();
  const response = error.getResponse() as HttpExceptionResponse;
  if (typeof response === 'string') {
    return { code: response, statusCode, details: {} };
  }
  const message = response.message;
  const code = typeof response.code === 'string'
    ? response.code
    : typeof message === 'string'
      ? message
      : undefined;
  const details = normalizeDetails(response.details);
  if (Array.isArray(message) && !details.issues) {
    details.issues = message;
  }
  return { code, statusCode, details };
}

function resolveClientSafeMessage(
  payload: { code?: string; statusCode: number },
  resolvedCode: HttpErrorCode,
): string {
  const catalogEntry = httpErrorCatalog[resolvedCode];
  if (
    payload.code &&
    !isKnownHttpErrorCode(payload.code) &&
    payload.statusCode >= 400 &&
    payload.statusCode < 500
  ) {
    return payload.code;
  }
  return catalogEntry.safeMessage;
}

export function normalizeException(error: unknown): NormalizedException {
  if (error instanceof AppException) {
    const entry = httpErrorCatalog[error.code];
    return {
      code: error.code,
      statusCode: entry.statusCode,
      details: error.details,
      safeMessage: error.clientMessage ?? entry.safeMessage,
      logLevel: entry.logLevel,
    };
  }

  if (error instanceof HttpException) {
    const payload = extractHttpExceptionPayload(error);
    const code = resolveHttpErrorCode(payload);
    return {
      code,
      statusCode: payload.statusCode,
      details: payload.details,
      safeMessage: resolveClientSafeMessage(payload, code),
      logLevel: httpErrorCatalog[code].logLevel,
    };
  }

  if (error instanceof Error) {
    const maybeMulterError = error as Error & { code?: unknown; status?: unknown; statusCode?: unknown };
    if (maybeMulterError.name === 'MulterError' && maybeMulterError.code === 'LIMIT_FILE_SIZE') {
      const entry = httpErrorCatalog.avatar_file_too_large;
      return {
        code: 'avatar_file_too_large',
        statusCode: HttpStatus.PAYLOAD_TOO_LARGE,
        details: {},
        safeMessage: entry.safeMessage,
        logLevel: entry.logLevel,
      };
    }

    const explicitStatusCode = typeof maybeMulterError.statusCode === 'number'
      ? maybeMulterError.statusCode
      : typeof maybeMulterError.status === 'number'
        ? maybeMulterError.status
        : HttpStatus.INTERNAL_SERVER_ERROR;
    const code = resolveHttpErrorCode({ code: error.message, statusCode: explicitStatusCode });
    const entry = httpErrorCatalog[code];
    return {
      code,
      statusCode: entry.statusCode,
      details: {},
      safeMessage: entry.safeMessage,
      logLevel: entry.logLevel,
    };
  }

  const entry = httpErrorCatalog.internal_server_error;
  return {
    code: 'internal_server_error',
    statusCode: entry.statusCode,
    details: {},
    safeMessage: entry.safeMessage,
    logLevel: entry.logLevel,
  };
}

@Catch()
@Injectable()
export class GlobalExceptionFilter implements ExceptionFilter {
  constructor(private readonly logger: AppLogger) {}

  catch(exception: unknown, host: ArgumentsHost) {
    const http = host.switchToHttp();
    const request = http.getRequest<Request>();
    const response = http.getResponse<Response>();
    const requestId = String(getRequestContext()?.requestId || response.getHeader('x-request-id') || request.headers['x-request-id'] || randomUUID());
    const normalized = normalizeException(exception);
    updateRequestContext({
      ...getRequestMetadata(request),
      requestId,
      statusCode: normalized.statusCode,
    });

    this.logException(exception, normalized);

    if (response.headersSent) return;
    const payload: ApiErrorResponse = {
      ok: false,
      error: {
        code: normalized.code,
        message: normalized.safeMessage,
        details: normalized.details,
      },
      requestId,
    };
    response.status(normalized.statusCode).json(payload);
  }

  private logException(exception: unknown, normalized: NormalizedException) {
    const context = getRequestContext();
    const durationMs = context ? Date.now() - context.startTime : undefined;
    const serialized = serializeErrorForLog(exception);
    const fields: Record<string, unknown> = {
      statusCode: normalized.statusCode,
      errorCode: normalized.code,
      durationMs,
      stack: serialized.stack,
      cause: serialized.cause,
      ...(serialized.responseBody !== undefined ? { responseBody: serialized.responseBody } : {}),
      ...(typeof serialized.status === 'number' ? { upstreamStatus: serialized.status } : {}),
      ...(serialized.provider !== undefined ? { provider: serialized.provider } : {}),
      ...(serialized.model !== undefined ? { model: serialized.model } : {}),
      ...(serialized.endpoint !== undefined ? { endpoint: serialized.endpoint } : {}),
    };

    switch (normalized.logLevel) {
      case HttpErrorLogLevel.Info:
        this.logger.info('http.request.error', fields);
        break;
      case HttpErrorLogLevel.Warn:
        this.logger.warn('http.request.error', fields);
        break;
      case HttpErrorLogLevel.Error:
      default:
        this.logger.error('http.request.error', fields);
        break;
    }
  }
}
