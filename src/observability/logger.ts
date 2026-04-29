import { Injectable } from '@nestjs/common';

import { redactSensitiveValue } from './redact.js';
import { getRequestContext } from './request-context.js';

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

@Injectable()
export class AppLogger {
  debug(event: string, fields: Record<string, unknown> = {}) {
    this.write('debug', event, fields);
  }

  info(event: string, fields: Record<string, unknown> = {}) {
    this.write('info', event, fields);
  }

  warn(event: string, fields: Record<string, unknown> = {}) {
    this.write('warn', event, fields);
  }

  error(event: string, fields: Record<string, unknown> = {}) {
    this.write('error', event, fields);
  }

  private write(level: LogLevel, event: string, fields: Record<string, unknown>) {
    const context = getRequestContext();
    const entry = redactSensitiveValue({
      timestamp: new Date().toISOString(),
      level,
      event,
      requestId: context?.requestId || 'n/a',
      method: context?.method,
      path: context?.path,
      ip: context?.ip,
      userId: context?.userId,
      workspaceSlug: context?.workspaceSlug,
      statusCode: context?.statusCode,
      ...fields,
    }) as Record<string, unknown>;
    if (process.env.NODE_ENV === 'production') {
      this.output(level, JSON.stringify(entry));
      return;
    }
    const extras = Object.fromEntries(
      Object.entries(entry).filter(([key, value]) => ![
        'timestamp',
        'level',
        'event',
        'requestId',
        'method',
        'path',
        'ip',
        'userId',
        'workspaceSlug',
        'statusCode',
      ].includes(key) && value !== undefined),
    );
    const line = [
      entry.timestamp,
      String(level).toUpperCase(),
      event,
      `requestId=${entry.requestId}`,
      entry.method ? `method=${entry.method}` : '',
      entry.path ? `path=${entry.path}` : '',
      entry.statusCode ? `statusCode=${entry.statusCode}` : '',
      entry.userId ? `userId=${entry.userId}` : '',
      entry.workspaceSlug ? `workspaceSlug=${entry.workspaceSlug}` : '',
    ].filter(Boolean).join(' ');
    this.output(level, Object.keys(extras).length ? `${line} ${JSON.stringify(extras)}` : line);
  }

  private output(level: LogLevel, line: string) {
    if (level === 'error') {
      console.error(line);
      return;
    }
    if (level === 'warn') {
      console.warn(line);
      return;
    }
    if (level === 'debug') {
      console.debug(line);
      return;
    }
    console.log(line);
  }
}
