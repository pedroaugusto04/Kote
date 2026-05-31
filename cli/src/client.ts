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

export class ApiClient {
  private async request(path: string, options: RequestInit = {}): Promise<Response> {
    const config = loadConfig();
    const apiBase = config.apiUrl.replace(/\/$/, '');
    let cleanPath = path;
    if (apiBase.endsWith('/api') && path.startsWith('/api')) {
      cleanPath = path.substring(4);
    }
    const url = `${apiBase}/${cleanPath.replace(/^\//, '')}`;

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
      saveConfig({ cookies: newCookies });
    }

    return response;
  }

  async fetch(path: string, options: RequestInit = {}): Promise<any> {
    let response = await this.request(path, options);

    // If unauthorized, attempt token refresh if we have a refresh token
    if (response.status === 401 && !path.includes('auth/login') && !path.includes('auth/refresh')) {
      const config = loadConfig();
      if (config.cookies.kb_refresh_token) {
        try {
          const refreshResponse = await this.request('/api/auth/refresh', { method: 'POST' });
          if (refreshResponse.ok) {
            // Token was refreshed (cookies saved automatically), retry original request
            response = await this.request(path, options);
          } else {
            clearConfigAuth();
          }
        } catch {
          clearConfigAuth();
        }
      }
    }

    if (!response.ok) {
      let body: any;
      try {
        body = await response.json();
      } catch {
        body = await response.text().catch(() => undefined);
      }
      throw new ApiClientError(
        response.status,
        body?.message || `Request failed with status ${response.status}`,
        body
      );
    }

    if (response.status === 204) {
      return null;
    }

    return response.json();
  }

  async login(email: string, password: string): Promise<any> {
    clearConfigAuth(); // Reset current auth cookies
    return this.fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
  }

  async logout(): Promise<any> {
    try {
      await this.fetch('/api/auth/logout', { method: 'POST' });
    } finally {
      clearConfigAuth();
    }
  }

  async ask(question: string, projectSlug?: string): Promise<any> {
    const config = loadConfig();
    return this.fetch('/api/ask', {
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
  ): Promise<any> {
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
    return this.fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
  }

  async listProjects(): Promise<any> {
    return this.fetch('/api/projects?limit=100');
  }

  async listWorkspaces(): Promise<any> {
    return this.fetch('/api/workspaces');
  }

  async createNote(body: any): Promise<any> {
    return this.fetch('/api/notes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  }

  async updateNote(id: string, body: any): Promise<any> {
    return this.fetch(`/api/notes/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  }
}

export const client = new ApiClient();

