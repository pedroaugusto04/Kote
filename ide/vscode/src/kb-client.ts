import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import https from 'node:https';
import http from 'node:http';
import type { KbConfig, KbProject, KbNote, KbReminder, KbAskResult, KbCreateNotePayload, KbCreateNoteResult } from './types';

// ---------------------------------------------------------------------------
// Config (mirrors the CLI config file used by the extension)
// ---------------------------------------------------------------------------

export type { KbConfig, KbProject, KbNote, KbReminder, KbAskResult, KbCreateNotePayload, KbCreateNoteResult } from './types';

const CONFIG_PATH = path.join(os.homedir(), '.config', 'kb', 'config.json');

export function loadKbConfig(): KbConfig {
  const defaults: KbConfig = {
    apiUrl: 'https://knowledgebase.sbs/kote/api',
    workspaceSlug: 'default',
    defaultProjectSlug: 'inbox',
    cookies: {},
  };
  try {
    if (!fs.existsSync(CONFIG_PATH)) return defaults;
    const raw = fs.readFileSync(CONFIG_PATH, 'utf8');
    const parsed = JSON.parse(raw);
    return { ...defaults, ...parsed, cookies: parsed.cookies ?? {} };
  } catch {
    return defaults;
  }
}

export function isConfigured(): boolean {
  if (!fs.existsSync(CONFIG_PATH)) return false;
  const config = loadKbConfig();
  return Boolean(config.cookies.kb_access_token || config.cookies.kb_refresh_token);
}

const CONFIG_DIR = path.dirname(CONFIG_PATH);

export function saveKbConfig(config: Partial<KbConfig>): void {
  try {
    if (!fs.existsSync(CONFIG_DIR)) {
      fs.mkdirSync(CONFIG_DIR, { recursive: true });
    }
    const current = loadKbConfig();
    const updated = {
      ...current,
      ...config,
      cookies: {
        ...current.cookies,
        ...(config.cookies || {}),
      },
    };
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(updated, null, 2), 'utf8');
    try {
      fs.chmodSync(CONFIG_PATH, 0o600);
    } catch {}
  } catch (error) {
    // ignore
  }
}

// ---------------------------------------------------------------------------
// HTTP helper — node:https/http without any external deps
// ---------------------------------------------------------------------------

interface RequestOptions {
  method?: string;
  headers?: Record<string, string>;
  body?: string;
}

function makeRequest(url: string, options: RequestOptions = {}): Promise<{ status: number; body: string; headers: Record<string, string | string[]> }> {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const isHttps = parsed.protocol === 'https:';
    const lib = isHttps ? https : http;

    const req = lib.request(
      {
        hostname: parsed.hostname,
        port: parsed.port || (isHttps ? 443 : 80),
        path: parsed.pathname + parsed.search,
        method: options.method ?? 'GET',
        headers: options.headers ?? {},
      },
      (res) => {
        let body = '';
        res.on('data', (chunk: Buffer) => { body += chunk.toString(); });
        res.on('end', () => {
          const headers: Record<string, string | string[]> = {};
          for (const [k, v] of Object.entries(res.headers)) {
            if (typeof v === 'string' || Array.isArray(v)) {
              headers[k] = v;
            }
          }
          resolve({ status: res.statusCode ?? 0, body, headers });
        });
      },
    );

    req.on('error', reject);
    if (options.body) req.write(options.body);
    req.end();
  });
}

// ---------------------------------------------------------------------------
// KbClient
// ---------------------------------------------------------------------------

export class KbClient {
  private config: KbConfig;
  public onUnauthorized?: () => void;

  constructor() {
    this.config = loadKbConfig();
  }

  /** Reload config from disk (e.g. after user runs the CLI init command) */
  reload() {
    this.config = loadKbConfig();
  }

  get workspaceSlug() { return this.config.workspaceSlug; }
  get defaultProjectSlug() { return this.config.defaultProjectSlug; }
  get apiUrl() { return this.config.apiUrl.replace(/\/$/, ''); }

  // -------------------------------------------------------------------------
  // Auth
  // -------------------------------------------------------------------------

  private buildCookieHeader(): string {
    const { kb_access_token, kb_refresh_token } = this.config.cookies;
    return [
      kb_access_token && `kb_access_token=${kb_access_token}`,
      kb_refresh_token && `kb_refresh_token=${kb_refresh_token}`,
    ]
      .filter(Boolean)
      .join('; ');
  }

  private buildUrl(urlPath: string): string {
    const apiBase = this.apiUrl.replace(/\/$/, ''); // Remove trailing slash
    let cleanPath = urlPath.replace(/^\//, ''); // Remove leading slash

    // If base URL already ends with /api, don't add it again from the path
    if (apiBase.endsWith('/api') && cleanPath.startsWith('api/')) {
      cleanPath = cleanPath.substring(4); // Remove 'api/' prefix
    }

    return `${apiBase}/${cleanPath}`;
  }

  private async fetch<T = unknown>(urlPath: string, options: RequestOptions = {}): Promise<T> {
    const url = this.buildUrl(urlPath);
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Cookie: this.buildCookieHeader(),
      ...options.headers,
    };

    let response = await makeRequest(url, { ...options, headers });

    // Attempt token refresh on 401
    if (response.status === 401) {
      let refreshed = false;
      if (this.config.cookies.kb_refresh_token) {
        try {
          const refreshResponse = await makeRequest(this.buildUrl('/api/auth/refresh'), {
            method: 'POST',
            headers: { Cookie: this.buildCookieHeader() },
          });
          if (refreshResponse.status < 300) {
            // Parse Set-Cookie and save
            const setCookie = refreshResponse.headers['set-cookie'] ?? '';
            this.updateCookiesFromSetCookie(setCookie);
            saveKbConfig({ cookies: this.config.cookies });
            headers.Cookie = this.buildCookieHeader();
            response = await makeRequest(url, { ...options, headers });
            refreshed = true;
          }
        } catch {
          // Ignore
        }
      }

      if (!refreshed) {
        this.config.cookies = {};
        saveKbConfig({ cookies: {} });
        this.onUnauthorized?.();
      }
    }

    if (response.status === 204) return undefined as T;

    // Check if response is HTML instead of JSON (indicates wrong URL or endpoint)
    const contentType = response.headers['content-type'] as string;
    if (contentType && contentType.includes('text/html')) {
      throw new Error(
        `API returned HTML instead of JSON. This usually means the API URL is incorrect or the endpoint doesn't exist.\n` +
        `Current API URL: ${this.apiUrl}\n` +
        `Requested path: ${urlPath}\n` +
        `Response status: ${response.status}`
      );
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(response.body);
    } catch (err) {
      throw new Error(
        `Failed to parse API response as JSON. The server may have returned an error page.\n` +
        `Current API URL: ${this.apiUrl}\n` +
        `Requested path: ${urlPath}\n` +
        `Response status: ${response.status}\n` +
        `Response body: ${response.body.substring(0, 200)}`
      );
    }

    if (response.status >= 400) {
      throw new Error((parsed as any)?.message ?? `Request failed with status ${response.status}`);
    }
    return parsed as T;
  }

  private updateCookiesFromSetCookie(setCookie: string | string[]) {
    // Simple parser for Set-Cookie headers
    const parts = Array.isArray(setCookie) ? setCookie : (setCookie || '').split(',');
    for (const part of parts) {
      const kv = part.split(';')[0]?.trim().split('=');
      if (kv && kv.length >= 2) {
        const key = kv[0].trim();
        const value = kv.slice(1).join('=').trim();
        if (key === 'kb_access_token') this.config.cookies.kb_access_token = value;
        if (key === 'kb_refresh_token') this.config.cookies.kb_refresh_token = value;
      }
    }
  }

  // -------------------------------------------------------------------------
  // API methods
  // -------------------------------------------------------------------------

  async listProjects(): Promise<KbProject[]> {
    const allProjects: KbProject[] = [];
    let page = 1;
    let hasNext = true;

    while (hasNext) {
      try {
        const result = await this.fetch<{
          projects?: KbProject[];
          items?: KbProject[];
          pagination?: { hasNext?: boolean };
        }>(`/api/projects?page=${page}&pageSize=50`);

        const list = result?.projects ?? result?.items ?? [];
        if (list.length === 0) break;
        allProjects.push(...list);

        hasNext = result?.pagination?.hasNext ?? false;
        page++;
      } catch (err) {
        // Fallback or break if request fails
        break;
      }
    }
    return allProjects;
  }

  async listRecentNotes(projectSlug?: string, limit = 5): Promise<KbNote[]> {
    const params = new URLSearchParams({ limit: String(limit), page: '1' });
    if (projectSlug) params.set('projectSlug', projectSlug);
    const result = await this.fetch<{ notes?: KbNote[]; items?: KbNote[] }>(`/api/notes?${params}`);
    return result?.notes ?? result?.items ?? [];
  }

  async listPendingReminders(projectSlug?: string): Promise<KbReminder[]> {
    const params = new URLSearchParams({ status: 'pending', limit: '5' });
    if (projectSlug) params.set('projectSlug', projectSlug);
    // Reminders are notes with pending/overdue status — try reminders endpoint first
    try {
      const result = await this.fetch<{ reminders?: KbReminder[]; items?: KbReminder[] }>(`/api/reminders?${params}`);
      return result?.reminders ?? result?.items ?? [];
    } catch {
      // Fallback: filter notes by status
      const params2 = new URLSearchParams({ status: 'pending,overdue', limit: '5' });
      if (projectSlug) params2.set('projectSlug', projectSlug);
      const result = await this.fetch<{ notes?: KbReminder[]; items?: KbReminder[] }>(`/api/notes?${params2}`);
      return result?.notes ?? result?.items ?? [];
    }
  }

  async ask(question: string, projectSlug?: string): Promise<KbAskResult> {
    return this.fetch<KbAskResult>('/api/ask', {
      method: 'POST',
      body: JSON.stringify({
        question,
        projectSlug: projectSlug ?? undefined,
        workspaceSlug: this.config.workspaceSlug,
      }),
    });
  }

  async getAskHistory(projectSlug?: string, page = 1, pageSize = 50): Promise<{ history: any[] }> {
    const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
    if (projectSlug) params.set('projectSlug', projectSlug);
    return this.fetch<{ history: any[] }>(`/api/ask/history?${params.toString()}`);
  }


  async createNote(payload: KbCreateNotePayload): Promise<KbCreateNoteResult> {
    return this.fetch<KbCreateNoteResult>('/api/notes', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }

  async sendConversationTurn(payload: {
    messageText: string;
    senderId: string;
    chatId: string;
    messageId: string;
    hasMedia?: boolean;
    media?: any;
  }, workspaceSlug?: string, projectSlug?: string): Promise<{
    action: 'ask' | 'confirm' | 'cancel' | 'submit';
    replyText: string;
    payload: any;
    ingestResult?: any;
    agent: any;
  }> {
    const ws = workspaceSlug || this.config.workspaceSlug || 'default';
    const params = new URLSearchParams({ workspaceSlug: ws });
    if (projectSlug) params.set('projectSlug', projectSlug);

    return this.fetch<any>(`/api/conversation/agent?${params}`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }

  async login(email: string, password: string): Promise<void> {
    this.config.cookies = {};
    saveKbConfig({ cookies: {} });

    const url = this.buildUrl('/api/auth/login');
    const headers = { 'Content-Type': 'application/json' };
    const body = JSON.stringify({ email, password });

    const response = await makeRequest(url, { method: 'POST', headers, body });
    if (response.status >= 400) {
      let errorMsg = 'Login failed';
      try {
        const parsed = JSON.parse(response.body);
        errorMsg = parsed?.message ?? errorMsg;
      } catch {}
      throw new Error(errorMsg);
    }

    const setCookie = response.headers['set-cookie'] ?? '';
    this.updateCookiesFromSetCookie(setCookie);
    saveKbConfig({ cookies: this.config.cookies });
  }

  async logout(): Promise<void> {
    this.config.cookies = {};
    try {
      const current = loadKbConfig();
      const updated = {
        ...current,
        cookies: {},
      };
      fs.writeFileSync(CONFIG_PATH, JSON.stringify(updated, null, 2), 'utf8');
      try {
        fs.chmodSync(CONFIG_PATH, 0o600);
      } catch {}
    } catch {}
  }

  async exchangeConnectionToken(token: string): Promise<{ accessToken: string; refreshToken: string }> {
    const url = this.buildUrl('/api/auth/exchange-connection-token');
    const headers = { 'Content-Type': 'application/json' };
    const body = JSON.stringify({ connectionToken: token });
    const response = await makeRequest(url, { method: 'POST', headers, body });
    if (response.status >= 400) {
      let errorMsg = 'Failed to exchange connection token';
      try {
        const parsed = JSON.parse(response.body);
        errorMsg = parsed?.message ?? errorMsg;
      } catch {}
      throw new Error(errorMsg);
    }
    return JSON.parse(response.body);
  }

  async validateAndSetGoogleToken(token: string): Promise<void> {
    const trimmed = token.trim();
    let accessToken: string | undefined = trimmed;
    let refreshToken: string | undefined = undefined;

    if (trimmed.startsWith('kbc_')) {
      try {
        const payload = Buffer.from(trimmed.slice(4), 'base64').toString('utf8');
        const parsed = JSON.parse(payload);
        if (parsed.accessToken && parsed.refreshToken) {
          accessToken = parsed.accessToken;
          refreshToken = parsed.refreshToken;
        } else {
          throw new Error('Not legacy format');
        }
      } catch (err) {
        try {
          const result = await this.exchangeConnectionToken(trimmed);
          accessToken = result.accessToken;
          refreshToken = result.refreshToken;
        } catch (exchangeErr) {
          // Fallback/propagate
        }
      }
    }

    this.config.cookies.kb_access_token = accessToken;
    this.config.cookies.kb_refresh_token = refreshToken;
    saveKbConfig({ cookies: { kb_access_token: accessToken, kb_refresh_token: refreshToken } });

    try {
      await this.listWorkspaces();
    } catch (err) {
      this.config.cookies.kb_access_token = undefined;
      this.config.cookies.kb_refresh_token = undefined;
      saveKbConfig({ cookies: { kb_access_token: undefined, kb_refresh_token: undefined } });
      throw err;
    }
  }

  async listWorkspaces(): Promise<{ workspaces: Array<{ workspaceSlug: string; displayName?: string }> }> {
    return this.fetch<{ workspaces: Array<{ workspaceSlug: string; displayName?: string }> }>('/api/workspaces');
  }

  async saveWorkspaceSelection(workspaceSlug: string): Promise<void> {
    this.config.workspaceSlug = workspaceSlug;
    saveKbConfig({ workspaceSlug });
  }
}
