import { randomUUID } from 'node:crypto';

import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Injectable } from '@nestjs/common';
import type { Request, Response } from 'express';

import type { ApiErrorDetails, ApiErrorResponse } from '../contracts/http-error.js';
import { resolveHttpErrorCode, httpErrorCatalog } from './http-error-catalog.js';
import { AppLogger } from './logger.js';
import { getRequestMetadata } from './request-metadata.js';
import { getRequestContext, updateRequestContext } from './request-context.js';

type HttpExceptionResponse = string | {
  code?: string;
  message?: string | string[];
  details?: Record<string, unknown>;
  error?: string;
  statusCode?: number;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function normalizeDetails(details: unknown): ApiErrorDetails {
  if (!isRecord(details)) return {};
  return details;
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

export function normalizeException(error: unknown): { code: string; statusCode: number; details: ApiErrorDetails; safeMessage: string; logLevel: 'debug' | 'info' | 'warn' | 'error' } {
  if (error instanceof HttpException) {
    const payload = extractHttpExceptionPayload(error);
    const code = resolveHttpErrorCode(payload);
    return {
      code,
      statusCode: payload.statusCode,
      details: payload.details,
      safeMessage: httpErrorCatalog[code].safeMessage,
      logLevel: httpErrorCatalog[code].logLevel,
    };
  }
  if (error instanceof Error) {
    const code = resolveHttpErrorCode({ code: error.message, statusCode: HttpStatus.INTERNAL_SERVER_ERROR });
    return {
      code,
      statusCode: httpErrorCatalog[code].statusCode,
      details: {},
      safeMessage: httpErrorCatalog[code].safeMessage,
      logLevel: httpErrorCatalog[code].logLevel,
    };
  }
  const code = 'internal_server_error';
  return {
    code,
    statusCode: httpErrorCatalog[code].statusCode,
    details: {},
    safeMessage: httpErrorCatalog[code].safeMessage,
    logLevel: httpErrorCatalog[code].logLevel,
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

  private logException(exception: unknown, normalized: ReturnType<typeof normalizeException>) {
    const context = getRequestContext();
    const durationMs = context ? Date.now() - context.startTime : undefined;
    const error = exception instanceof Error ? exception : undefined;
    const fields = {
      statusCode: normalized.statusCode,
      errorCode: normalized.code,
      durationMs,
      stack: error?.stack,
      cause: error?.cause instanceof Error ? error.cause.message : error?.cause,
    };
    this.logger[normalized.logLevel]('http.request.error', fields);
  }
}
