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
const ANSI_BRIGHT_GREEN = '\u001B[92m';
const ANSI_BRIGHT_YELLOW = '\u001B[93m';
const ANSI_BRIGHT_RED = '\u001B[91m';
const ANSI_BRIGHT_CYAN = '\u001B[96m';
const ANSI_CYAN = '\u001B[36m';
const ANSI_WHITE = '\u001B[37m';
const LOG_LEVEL_LABELS: Readonly<Record<LogLevel, string>> = {
  debug: 'DEBUG',
  info: 'INFO',
  warn: 'WARN',
  error: 'ERROR',
};

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
  const configuredValue = process.env.KB_LOG_PRETTY_CONSOLE ?? process.env.LOG_PRETTY_CONSOLE;
  return resolveBooleanEnvironmentFlag(configuredValue, true);
}

function formatLevelLabel(level: LogLevel) {
  const label = LOG_LEVEL_LABELS[level];
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

function formatKeyValue(key: string, value: unknown, prettyConsoleLogsEnabled: boolean) {
  const renderedValue = String(value);
  if (!prettyConsoleLogsEnabled) {
    return `${key}=${renderedValue}`;
  }
  if (key === 'statusCode') {
    const numericValue = Number(value);
    const statusColor =
      numericValue >= 500
        ? ANSI_BRIGHT_RED
        : numericValue >= 400
          ? ANSI_RED
          : numericValue >= 300
            ? ANSI_BRIGHT_YELLOW
            : ANSI_BRIGHT_GREEN;
    return `${ANSI_BRIGHT_CYAN}${key}${ANSI_RESET}=${statusColor}${renderedValue}${ANSI_RESET}`;
  }
  return `${ANSI_WHITE}${key}${ANSI_RESET}=${renderedValue}`;
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
    const message = [
      event,
      formatKeyValue('requestId', entry.requestId, prettyConsoleLogsEnabled),
      entry.method ? formatKeyValue('method', entry.method, prettyConsoleLogsEnabled) : '',
      entry.path ? formatKeyValue('path', entry.path, prettyConsoleLogsEnabled) : '',
      entry.statusCode ? formatKeyValue('statusCode', entry.statusCode, prettyConsoleLogsEnabled) : '',
      entry.userId ? formatKeyValue('userId', entry.userId, prettyConsoleLogsEnabled) : '',
      entry.workspaceSlug ? formatKeyValue('workspaceSlug', entry.workspaceSlug, prettyConsoleLogsEnabled) : '',
    ].filter(Boolean).join(' ');
    const line = [
      entry.timestamp,
      prettyConsoleLogsEnabled ? formatLevelLabel(level) : LOG_LEVEL_LABELS[level],
      prettyConsoleLogsEnabled ? `${ANSI_WHITE}${message}${ANSI_RESET}` : message,
    ];
    if (!Object.keys(extras).length) {
      this.output(level, line.join(' | '));
      return;
    }
    const extrasText = JSON.stringify(extras);
    this.output(
      level,
      prettyConsoleLogsEnabled
        ? `${line.join(' | ')} | ${ANSI_DIM}${extrasText}${ANSI_RESET}`
        : `${line.join(' | ')} | ${extrasText}`,
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
