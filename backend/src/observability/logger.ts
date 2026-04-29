import { Injectable } from '@nestjs/common';

import { redactSensitiveValue } from './redact.js';
import { getRequestContext } from './request-context.js';

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LOG_FIELDS_ALWAYS_INLINE = new Set([
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
]);

const ANSI_RESET = '\u001B[0m';
const ANSI_DIM = '\u001B[2m';
const ANSI_RED = '\u001B[31m';
const ANSI_GREEN = '\u001B[32m';
const ANSI_YELLOW = '\u001B[33m';
const ANSI_BLUE = '\u001B[34m';
const ANSI_CYAN = '\u001B[36m';
const ANSI_WHITE = '\u001B[37m';

function resolveBooleanEnvironmentFlag(rawValue: string | undefined, defaultValue: boolean): boolean {
  const normalizedValue = rawValue?.trim().toLowerCase();
  if (!normalizedValue) {
    return defaultValue;
  }
  if (['1', 'true', 'yes', 'on'].includes(normalizedValue)) {
    return true;
  }
  if (['0', 'false', 'no', 'off'].includes(normalizedValue)) {
    return false;
  }
  return defaultValue;
}

function isPrettyConsoleLogsEnabled() {
  return resolveBooleanEnvironmentFlag(process.env.KB_LOG_PRETTY_CONSOLE, process.env.NODE_ENV !== 'production');
}

function formatLevelLabel(level: LogLevel) {
  const label = level.toUpperCase().padEnd(5, ' ');
  if (!isPrettyConsoleLogsEnabled()) {
    return label;
  }
  const color =
    level === 'error'
      ? ANSI_RED
      : level === 'warn'
        ? ANSI_YELLOW
        : level === 'info'
          ? ANSI_GREEN
          : ANSI_CYAN;
  return `${color}${label}${ANSI_RESET}`;
}

function formatKeyValue(key: string, value: unknown) {
  const renderedValue = String(value);
  if (!isPrettyConsoleLogsEnabled()) {
    return `${key}=${renderedValue}`;
  }
  const keyColor = key === 'statusCode' ? ANSI_BLUE : ANSI_WHITE;
  return `${ANSI_DIM}${keyColor}${key}${ANSI_RESET}${ANSI_DIM}=${ANSI_RESET}${renderedValue}`;
}

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
    const prettyConsoleLogsEnabled = isPrettyConsoleLogsEnabled();
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
      if (!prettyConsoleLogsEnabled) {
        this.output(level, JSON.stringify(entry));
        return;
      }
    }
    const extras = Object.fromEntries(
      Object.entries(entry).filter(([key, value]) => !LOG_FIELDS_ALWAYS_INLINE.has(key) && value !== undefined),
    );
    const line = [
      prettyConsoleLogsEnabled ? `${ANSI_DIM}${entry.timestamp}${ANSI_RESET}` : entry.timestamp,
      prettyConsoleLogsEnabled ? formatLevelLabel(level) : level.toUpperCase().padEnd(5, ' '),
      prettyConsoleLogsEnabled ? `${ANSI_BLUE}${event}${ANSI_RESET}` : event,
      formatKeyValue('requestId', entry.requestId),
      entry.method ? formatKeyValue('method', entry.method) : '',
      entry.path ? formatKeyValue('path', entry.path) : '',
      entry.statusCode ? formatKeyValue('statusCode', entry.statusCode) : '',
      entry.userId ? formatKeyValue('userId', entry.userId) : '',
      entry.workspaceSlug ? formatKeyValue('workspaceSlug', entry.workspaceSlug) : '',
    ].filter(Boolean).join(' ');
    if (!Object.keys(extras).length) {
      this.output(level, line);
      return;
    }
    const extrasText = JSON.stringify(extras);
    this.output(
      level,
      prettyConsoleLogsEnabled
        ? `${line} ${ANSI_DIM}${extrasText}${ANSI_RESET}`
        : `${line} ${extrasText}`,
    );
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
