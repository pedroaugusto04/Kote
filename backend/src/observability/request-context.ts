  import { AsyncLocalStorage } from 'node:async_hooks';

export type RequestContextState = {
  requestId: string;
  startTime: number;
  method: string;
  path: string;
  ip: string;
  userId?: string;
  workspaceSlug?: string;
  statusCode?: number;
};

const requestContextStorage = new AsyncLocalStorage<RequestContextState>();

export function runWithRequestContext<T>(context: RequestContextState, callback: () => T): T {
  return requestContextStorage.run(context, callback);
}

export function getRequestContext(): RequestContextState | undefined {
  return requestContextStorage.getStore();
}

export function updateRequestContext(partial: Partial<RequestContextState>): RequestContextState | undefined {
  const current = requestContextStorage.getStore();
  if (!current) return undefined;
  Object.assign(current, partial);
  return current;
}
