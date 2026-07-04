import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

import { StderrLogger } from '../logger/stderr.logger.js';
import { CONFIG_CONSTANTS, ENV_VARS } from '../constants/mcp.constants.js';
import { clearPersistedCookies, maybeExchangeConnectionToken } from '../config/connection-token.js';
import type { CliConfig } from '../types/mcp.types.js';
import type { ApiProject, ApiSearchResponse, ApiNoteDetail, ApiCreateNoteResponse } from '../types/kote-api.types.js';

export class ApiClient {
  constructor(private config: CliConfig) {}

  private buildCookieHeader(): string {
    const { kb_access_token, kb_refresh_token } = this.config.cookies;
    return [
      kb_access_token && `kb_access_token=${kb_access_token}`,
      kb_refresh_token && `kb_refresh_token=${kb_refresh_token}`,
    ]
      .filter(Boolean)
      .join('; ');
  }

  private persistCookies(setCookieHeaders: string[]): void {
    for (const header of setCookieHeaders) {
      const [kv] = header.split(';');
      const eqIdx = kv?.indexOf('=') ?? -1;
      if (eqIdx === -1) continue;
      const key = kv.slice(0, eqIdx).trim();
      const value = kv.slice(eqIdx + 1).trim();
      if (key === 'kb_access_token') this.config.cookies.kb_access_token = value;
      if (key === 'kb_refresh_token') this.config.cookies.kb_refresh_token = value;
    }

    // Write back to the shared config file so other tools see the refreshed tokens
    try {
      const configDir = process.env[ENV_VARS.ConfigDir] || path.join(
        os.homedir(),
        CONFIG_CONSTANTS.DefaultConfigDirName,
        CONFIG_CONSTANTS.DefaultConfigAppName,
      );
      const configFile = path.join(configDir, CONFIG_CONSTANTS.ConfigFileName);
      let existing: Record<string, unknown> = {};
      try {
        existing = JSON.parse(fs.readFileSync(configFile, 'utf8')) as Record<string, unknown>;
      } catch { /* ignore */ }
      const updated = { ...existing, cookies: { ...(existing.cookies as object ?? {}), ...this.config.cookies } };
      fs.writeFileSync(configFile, JSON.stringify(updated, null, 2), 'utf8');
    } catch { /* ignore */ }
  }

  private async rawRequest(urlPath: string, options: RequestInit = {}): Promise<Response> {
    const apiBase = this.config.apiUrl.replace(/\/$/, '');
    const cleanPath = urlPath.replace(/^\//, '');
    const url = `${apiBase}/${cleanPath}`;

    const headers = new Headers(options.headers || {});

    // Attach authorization cookies
    const cookieHeader = this.buildCookieHeader();
    if (cookieHeader) {
      headers.set('Cookie', cookieHeader);
    }

    // Set common headers
    if (options.body && !headers.has('Content-Type')) {
      headers.set('Content-Type', 'application/json');
    }

    StderrLogger.debug(`HTTP Request: ${options.method || 'GET'} ${url}`);

    return fetch(url, { ...options, headers });
  }

  private async request(urlPath: string, options: RequestInit = {}): Promise<Response> {
    let response = await this.rawRequest(urlPath, options);

    // On 401 attempt a token refresh (mirrors CLI and VS Code extension behaviour)
    if (response.status === 401 && !urlPath.includes('auth/refresh')) {
      let refreshed = false;
      if (this.config.cookies.kb_refresh_token) {
        try {
          const refreshResponse = await this.rawRequest('/api/auth/refresh', { method: 'POST' });
          if (refreshResponse.ok) {
            const setCookieHeaders =
              typeof refreshResponse.headers.getSetCookie === 'function'
                ? refreshResponse.headers.getSetCookie()
                : [];
            if (setCookieHeaders.length > 0) {
              this.persistCookies(setCookieHeaders);
            }
            // Retry original request with refreshed cookies
            response = await this.rawRequest(urlPath, options);
            refreshed = true;
          }
        } catch {
          // Ignore refresh errors — fall through to error handling below
        }
      }

      if (!refreshed) {
        // Refresh failed — try a live connection-token re-exchange if available
        const connectionToken = process.env[ENV_VARS.ConnectionToken];
        if (connectionToken) {
          try {
            StderrLogger.info('Token refresh failed — attempting connection-token re-exchange...');
            // Clear stale cookies so maybeExchangeConnectionToken proceeds
            clearPersistedCookies(this.config);
            await maybeExchangeConnectionToken(this.config);
            // Retry original request with freshly exchanged tokens
            response = await this.rawRequest(urlPath, options);
            if (response.ok || response.status !== 401) {
              // Re-exchange worked — carry on
            } else {
              let errorBody = '';
              try { errorBody = await response.text(); } catch { /* ignore */ }
              throw new Error(`API Request failed with status ${response.status} (${response.statusText}): ${errorBody}`);
            }
          } catch (reExchangeErr) {
            // Re-exchange itself failed — clear cookies so next startup retries
            clearPersistedCookies(this.config);
            throw reExchangeErr;
          }
        } else {
          let errorBody = '';
          try { errorBody = await response.text(); } catch { /* ignore */ }
          throw new Error(`API Request failed with status ${response.status} (${response.statusText}): ${errorBody}`);
        }
      }
    }

    if (!response.ok) {
      const statusText = response.statusText;
      let errorBody = '';
      try {
        errorBody = await response.text();
      } catch {
        // Ignore
      }
      throw new Error(`API Request failed with status ${response.status} (${statusText}): ${errorBody}`);
    }

    return response;
  }

  async searchNotes(query: string, projectSlug?: string): Promise<ApiSearchResponse> {
    const activeProject = projectSlug || this.config.defaultProjectSlug;
    const urlParams = new URLSearchParams();
    urlParams.set('query', query);
    urlParams.set('limit', '10');

    // Add workspace and project headers/query values if applicable
    let path = `query?${urlParams.toString()}`;
    const headers = new Headers();
    headers.set('x-workspace-slug', this.config.workspaceSlug);
    if (activeProject) {
      headers.set('x-project-slug', activeProject);
    }

    const response = await this.request(path, {
      method: 'GET',
      headers,
    });
    
    return response.json() as Promise<ApiSearchResponse>;
  }

  async getNoteDetail(id: string): Promise<ApiNoteDetail> {
    const response = await this.request(`notes/${encodeURIComponent(id)}`, {
      method: 'GET',
    });
    const data = await response.json() as { ok: boolean; note: ApiNoteDetail };
    if (!data.ok || !data.note) {
      throw new Error(`Failed to retrieve note detail for ID ${id}`);
    }
    return data.note;
  }

  async createNote(title: string, markdown: string, projectSlug?: string): Promise<ApiCreateNoteResponse> {
    const activeProject = projectSlug || this.config.defaultProjectSlug;
    
    const body = {
      title,
      rawText: markdown,
      projectSlug: activeProject,
      sourceChannel: 'mcp',
      source: 'mcp-server',
    };

    const headers = new Headers();
    headers.set('x-workspace-slug', this.config.workspaceSlug);
    headers.set('x-project-slug', activeProject);

    const response = await this.request('notes', {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });

    return response.json() as Promise<ApiCreateNoteResponse>;
  }

  async listProjects(): Promise<ApiProject[]> {
    const response = await this.request('projects?limit=100', {
      method: 'GET',
    });
    const data = await response.json() as { ok: boolean; projects: ApiProject[] };
    return data.projects || [];
  }
}
