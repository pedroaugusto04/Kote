import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { json, urlencoded, type NextFunction, type Request, type Response } from 'express';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';

import { readEnvironment } from './adapters/environment.js';
import { AppModule } from './app.module.js';
import { GlobalExceptionFilter } from './observability/global-exception.filter.js';
import { AppLogger } from './observability/logger.js';
import { requestLifecycleMiddleware } from './observability/request-lifecycle.middleware.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function saveRawBody(request: Request & { rawBody?: Buffer }, _response: Response, buffer: Buffer) {
  request.rawBody = Buffer.from(buffer);
}

export async function createApp(): Promise<NestExpressApplication> {
  const environment = readEnvironment();
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { bodyParser: false, logger: false });
  const bodyLimit = process.env.KB_BODY_LIMIT || '10mb';
  app.use(json({ limit: bodyLimit, verify: saveRawBody }));
  app.use(urlencoded({ extended: true, limit: bodyLimit, verify: saveRawBody }));
  if (environment.trustProxy) {
    app.set('trust proxy', 1);
  }
  app.use((_request: Request, response: Response, next: NextFunction) => {
    response.setHeader('x-content-type-options', 'nosniff');
    response.setHeader('x-frame-options', 'sameorigin');
    response.setHeader('referrer-policy', 'strict-origin-when-cross-origin');
    next();
  });
  app.enableCors({
    origin(origin, callback) {
      if (!origin) return callback(null, true);
      const allowedOrigins = new Set(environment.allowedOrigins);
      if (environment.publicBaseUrl) allowedOrigins.add(new URL(environment.publicBaseUrl).origin);
      callback(null, allowedOrigins.has(origin.replace(/\/$/, '')));
    },
    credentials: true,
  });

  const logger = app.get(AppLogger);
  app.use(requestLifecycleMiddleware(logger));
  const staticRoot = path.resolve(__dirname, 'frontend');
  app.useStaticAssets(staticRoot);
  app.setBaseViewsDir(staticRoot);

  app.useGlobalFilters(app.get(GlobalExceptionFilter));

  return app;
}

export async function startApp() {
  const app = await createApp();
  const port = Number(process.env.KB_API_PORT || process.env.PORT || 4310);
  const host = process.env.KB_API_HOST || '127.0.0.1';
  await app.listen(port, host);
  app.get(AppLogger).info('http.server.started', { host, port });
  return app;
}
