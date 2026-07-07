import { loadConfig, saveConfig, clearConfigAuth } from './config.js';

export const CLI_API_PATHS = {
  AUTH_LOGIN: '/api/auth/login',
  AUTH_REFRESH: '/api/auth/refresh',
  AUTH_EXCHANGE_TOKEN: '/api/auth/exchange-connection-token',
  AUTH_LOGOUT: '/api/auth/logout',
  ASK: '/api/ask',
  CONVERSATION_AGENT: '/api/conversation/agent',
  PROJECTS: '/api/projects',
  WORKSPACES: '/api/workspaces',
  NOTES: '/api/notes',
  NOTE_DETAIL: '/api/notes/{id}',
} as const;

export function buildCliApiPath(template: string, params: Record<string, string>): string {
  let path = template;
  Object.entries(params).forEach(([key, value]) => {
    path = path.replace(`{${key}}`, encodeURIComponent(value));
  });
  return path;
}


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
  public onAuthCleared?: () => void;

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
    if (response.status === 401 && !path.includes(CLI_API_PATHS.AUTH_LOGIN) && !path.includes(CLI_API_PATHS.AUTH_REFRESH)) {
      const config = loadConfig();
      let refreshed = false;
      if (config.cookies?.kb_refresh_token) {
        try {
          const refreshResponse = await this.request(CLI_API_PATHS.AUTH_REFRESH, { method: 'POST' });
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
        const wasConfigured = config.cookies?.kb_access_token || config.cookies?.kb_refresh_token;
        clearConfigAuth();
        if (wasConfigured) {
          this.onAuthCleared?.();
        }
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
    return this.fetch(CLI_API_PATHS.AUTH_LOGIN, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
  }

  async exchangeConnectionToken(connectionToken: string): Promise<{ accessToken: string; refreshToken: string }> {
    clearConfigAuth();
    return this.fetch<{ accessToken: string; refreshToken: string }>(CLI_API_PATHS.AUTH_EXCHANGE_TOKEN, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ connectionToken }),
    });
  }

  async logout(): Promise<void> {
    try {
      await this.fetch<void>(CLI_API_PATHS.AUTH_LOGOUT, { method: 'POST' });
    } finally {
      clearConfigAuth();
    }
  }

  async ask(question: string, projectSlug?: string): Promise<CliAskResult> {
    const config = loadConfig();
    return this.fetch<CliAskResult>(CLI_API_PATHS.ASK, {
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
    let url = `${CLI_API_PATHS.CONVERSATION_AGENT}?workspaceSlug=${encodeURIComponent(config.workspaceSlug)}`;
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
    const response = await this.fetch<{ projects: CliProject[] }>(`${CLI_API_PATHS.PROJECTS}?limit=100`);
    return response.projects || [];
  }

  async listWorkspaces(): Promise<{ workspaces: CliWorkspace[] }> {
    return this.fetch<{ workspaces: CliWorkspace[] }>(CLI_API_PATHS.WORKSPACES);
  }

  async createNote(body: Record<string, unknown> | unknown): Promise<CliCreateNoteResult> {
    return this.fetch<CliCreateNoteResult>(CLI_API_PATHS.NOTES, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  }

  async updateNote(id: string, body: Record<string, unknown> | unknown): Promise<CliCreateNoteResult> {
    return this.fetch<CliCreateNoteResult>(buildCliApiPath(CLI_API_PATHS.NOTE_DETAIL, { id }), {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  }
}

export const client = new ApiClient();

