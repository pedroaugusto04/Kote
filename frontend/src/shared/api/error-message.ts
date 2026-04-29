import { ApiClientError } from './models/error';

export function getErrorMessage(error: unknown, fallbackMessage: string): string {
  if (error instanceof ApiClientError && error.message.trim()) return error.message;
  return fallbackMessage;
}
