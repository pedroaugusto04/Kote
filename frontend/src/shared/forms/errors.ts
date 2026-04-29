import type { FieldErrors, FieldPath, FieldValues, UseFormSetError } from 'react-hook-form';

import { ApiClientError } from '../api/models/error';
import { getErrorMessage } from '../api/error-message';
import { notifyError } from '../ui/notifications';

export type BackendFieldErrors = Record<string, string>;

function isStringRecord(value: unknown): value is BackendFieldErrors {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  return Object.values(value).every((item) => typeof item === 'string');
}

export function getBackendFieldErrors(error: unknown): BackendFieldErrors {
  if (!(error instanceof ApiClientError)) return {};
  const fieldErrors = error.details.fieldErrors;
  return isStringRecord(fieldErrors) ? fieldErrors : {};
}

export function applyBackendFieldErrors<TFieldValues extends FieldValues>(
  error: unknown,
  setError: UseFormSetError<TFieldValues>,
) {
  const fieldErrors = getBackendFieldErrors(error);
  const entries = Object.entries(fieldErrors);
  for (const [name, message] of entries) {
    setError(name as FieldPath<TFieldValues>, { type: 'server', message });
  }
  return entries.map(([name]) => name);
}

export function notifyGeneralFormError(error: unknown, fallbackMessage: string) {
  if (Object.keys(getBackendFieldErrors(error)).length > 0) return;
  notifyError(getErrorMessage(error, fallbackMessage));
}

export function fieldNamesFromErrors(errors: FieldErrors<FieldValues>): string[] {
  const names: string[] = [];

  function visit(value: unknown, prefix = '') {
    if (!value || typeof value !== 'object') return;
    if ('message' in value && prefix) names.push(prefix);
    for (const [key, child] of Object.entries(value)) {
      if (key === 'ref' || key === 'type' || key === 'message') continue;
      visit(child, prefix ? `${prefix}.${key}` : key);
    }
  }

  visit(errors);
  return names;
}

export function focusFirstFormError(root: HTMLElement | null, names: string[]) {
  const scope = root || document.body;
  const normalizedNames = names.filter(Boolean);
  if (normalizedNames.length === 0) return;
  const candidates = Array.from(scope.querySelectorAll<HTMLElement>('[name], [id], [data-field]'));
  const target = candidates.find((element) => normalizedNames.some((name) => (
    element.getAttribute('name') === name
    || (element.getAttribute('name') ? name.startsWith(`${element.getAttribute('name')}.`) : false)
    || element.id === name
    || element.dataset.field === name
    || (element.dataset.field ? name.startsWith(`${element.dataset.field}.`) : false)
  )));
  const focusTarget = target?.matches('input, textarea, select, button')
    ? target
    : target?.querySelector<HTMLElement>('input, textarea, select, button');
  const element = focusTarget || target;
  element?.scrollIntoView?.({ block: 'center', behavior: 'smooth' });
  focusTarget?.focus?.();
}
