import { loadConfig, saveConfig, clearConfigAuth } from './config.js';

export class ApiClientError extends Error {
  constructor(public status: number, message: string, public body?: unknown) {
    super(message);
    this.name = 'ApiClientError';
  }
}

function parseSetCookie(cookieHeaders: string[]): Record<string, string> {
  const cookies: Record<string, string> = {};
  for (const header of cookieHeaders) {
    const parts = header.split(';')[0]?.trim().split('=') || [];
    if (parts[0] && parts[1] !== undefined) {
      cookies[parts[0]] = decodeURIComponent(parts[1]);
    }
  }
  return cookies;
}

export interface CliWorkspace {
  workspaceSlug: string;
  displayName?: string;
}

export interface CliProject {
  projectSlug: string;
  displayName: string;
  workspaceSlug: string;
  enabled: boolean;
  name?: string;
}

export interface CliAskResult {
  ok: boolean;
  answer: string;
  confidence?: number | string;
  sources?: Array<{ title?: string; fileName?: string; path?: string }>;
}

export interface CliCreateNoteResult {
  noteId?: string;
  id?: string;
}

export interface CliAgentResponse {
  action: 'ask' | 'confirm' | 'cancel' | 'submit';
  replyText?: string;
  payload?: unknown;
  ingestResult?: unknown;
  agent?: {
    selectedProjectSlug?: string;
  };
}

export class ApiClient {
  private async request(path: string, options: RequestInit = {}): Promise<Response> {
    const config = loadConfig();
    const apiBase = config.apiUrl.replace(/\/$/, ''); // Remove trailing slash
    let cleanPath = path.replace(/^\//, ''); // Remove leading slash

    // If base URL already ends with /api, don't add it again from the path
    if (apiBase.endsWith('/api') && cleanPath.startsWith('api/')) {
      cleanPath = cleanPath.substring(4); // Remove 'api/' prefix
    }

    const url = `${apiBase}/${cleanPath}`;

    const headers = new Headers(options.headers || {});
    if (config.cookies.kb_access_token || config.cookies.kb_refresh_token) {
      const cookieParts: string[] = [];
      if (config.cookies.kb_access_token) cookieParts.push(`kb_access_token=${config.cookies.kb_access_token}`);
      if (config.cookies.kb_refresh_token) cookieParts.push(`kb_refresh_token=${config.cookies.kb_refresh_token}`);
      headers.set('Cookie', cookieParts.join('; '));
    }

    const response = await fetch(url, { ...options, headers });

    // Extract cookies from Set-Cookie headers
    // getSetCookie() is available in Node.js 18+ global fetch Response
    const setCookieHeaders = typeof response.headers.getSetCookie === 'function' 
      ? response.headers.getSetCookie() 
      : [];

    if (setCookieHeaders.length > 0) {
      const newCookies = parseSetCookie(setCookieHeaders);
      saveConfig({
        cookies: {
          ...config.cookies,
          ...newCookies,
        },
      });
    }

    return response;
  }

  async fetch<T = unknown>(path: string, options: RequestInit = {}): Promise<T> {
    let response = await this.request(path, options);

    // If unauthorized, attempt token refresh if we have a refresh token
    if (response.status === 401 && !path.includes('auth/login') && !path.includes('auth/refresh')) {
      const config = loadConfig();
      let refreshed = false;
      if (config.cookies?.kb_refresh_token) {
        try {
          const refreshResponse = await this.request('/api/auth/refresh', { method: 'POST' });
          if (refreshResponse.ok) {
            // Token was refreshed (cookies saved automatically), retry original request
            response = await this.request(path, options);
            refreshed = true;
          }
        } catch {
          // Ignore
        }
      }
      if (!refreshed) {
        clearConfigAuth();
      }
    }

    if (!response.ok) {
      let body: unknown;
      try {
        body = await response.json();
      } catch {
        body = await response.text().catch(() => undefined);
      }
      const message = body && typeof body === 'object' && 'message' in body && typeof (body as { message: unknown }).message === 'string'
        ? (body as { message: string }).message
        : `Request failed with status ${response.status}`;
      throw new ApiClientError(response.status, message, body);
    }

    if (response.status === 204) {
      return null as unknown as T;
    }

    return response.json() as Promise<T>;
  }

  async login(email: string, password: string): Promise<unknown> {
    clearConfigAuth(); // Reset current auth cookies
    return this.fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
  }

  async exchangeConnectionToken(connectionToken: string): Promise<{ accessToken: string; refreshToken: string }> {
    clearConfigAuth();
    return this.fetch<{ accessToken: string; refreshToken: string }>('/api/auth/exchange-connection-token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ connectionToken }),
    });
  }

  async logout(): Promise<void> {
    try {
      await this.fetch<void>('/api/auth/logout', { method: 'POST' });
    } finally {
      clearConfigAuth();
    }
  }

  async ask(question: string, projectSlug?: string): Promise<CliAskResult> {
    const config = loadConfig();
    return this.fetch<CliAskResult>('/api/ask', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        question,
        projectSlug: projectSlug || undefined,
        workspaceSlug: config.workspaceSlug || undefined,
      }),
    });
  }

  async sendAgentMessage(
    text: string,
    media?: { fileName: string; mimeType: string; sizeBytes: number; dataBase64: string },
    projectSlug?: string
  ): Promise<CliAgentResponse> {
    const config = loadConfig();
    const activeProject = projectSlug || config.defaultProjectSlug;
    const payload = {
      messageText: text,
      senderId: 'cli-user',
      chatId: 'cli-session',
      hasMedia: !!media,
      media: media || {},
    };
    let url = `/api/conversation/agent?workspaceSlug=${encodeURIComponent(config.workspaceSlug)}`;
    if (activeProject) {
      url += `&projectSlug=${encodeURIComponent(activeProject)}`;
    }
    return this.fetch<CliAgentResponse>(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
  }

  async listProjects(): Promise<CliProject[]> {
    return this.fetch<CliProject[]>('/api/projects?limit=100');
  }

  async listWorkspaces(): Promise<{ workspaces: CliWorkspace[] }> {
    return this.fetch<{ workspaces: CliWorkspace[] }>('/api/workspaces');
  }

  async createNote(body: Record<string, unknown> | unknown): Promise<CliCreateNoteResult> {
    return this.fetch<CliCreateNoteResult>('/api/notes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  }

  async updateNote(id: string, body: Record<string, unknown> | unknown): Promise<CliCreateNoteResult> {
    return this.fetch<CliCreateNoteResult>(`/api/notes/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  }
}

export const client = new ApiClient();

