export type GatewayHttpRequestOptions = {
  url: string;
  init?: RequestInit;
  headers: Record<string, string>;
  timeoutMs?: number;
  mapError: (error: unknown) => Error;
  mapHttpError: (status: number, data: unknown) => Error;
};

export async function executeGatewayHttpRequest<T>(options: GatewayHttpRequestOptions): Promise<T> {
  try {
    const response = await fetch(options.url, {
      ...options.init,
      headers: {
        ...options.headers,
        ...(options.init?.headers as Record<string, string> | undefined),
      },
      ...(options.timeoutMs ? { signal: AbortSignal.timeout(options.timeoutMs) } : {}),
    });

    const text = await response.text();
    let data: unknown = null;
    if (text) {
      try {
        data = JSON.parse(text);
      } catch {
        data = text;
      }
    }

    if (!response.ok) {
      throw options.mapHttpError(response.status, data);
    }

    return data as T;
  } catch (err) {
    throw options.mapError(err);
  }
}
