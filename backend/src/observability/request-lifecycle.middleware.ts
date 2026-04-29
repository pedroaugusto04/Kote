import { randomUUID } from 'node:crypto';

import type { NextFunction, Request, Response } from 'express';

import { AppLogger } from './logger.js';
import { getRequestMetadata, getSafeRequestLogDetails } from './request-metadata.js';
import { runWithRequestContext, updateRequestContext } from './request-context.js';

function resolveRequestId(request: Request): string {
  const header = String(request.headers['x-request-id'] || '').trim();
  return header || randomUUID();
}

export function requestLifecycleMiddleware(logger: AppLogger) {
  return (request: Request, response: Response, next: NextFunction) => {
    const requestId = resolveRequestId(request);
    const startedAt = Date.now();
    response.setHeader('x-request-id', requestId);
    runWithRequestContext({
      requestId,
      startTime: startedAt,
      ...getRequestMetadata(request),
    }, () => {
      logger.info('http.request.start', getSafeRequestLogDetails(request));
      let completed = false;
      const finish = () => {
        if (completed) return;
        completed = true;
        updateRequestContext({
          ...getRequestMetadata(request),
          statusCode: response.statusCode,
        });
        logger.info('http.request.finish', {
          statusCode: response.statusCode,
          durationMs: Date.now() - startedAt,
        });
      };
      response.on('finish', finish);
      response.on('close', finish);
      next();
    });
  };
}
