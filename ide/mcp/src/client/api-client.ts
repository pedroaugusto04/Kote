import { StderrLogger } from '../logger/stderr.logger.js';
import type { CliConfig } from '../types/mcp.types.js';
import type { ApiProject, ApiSearchResponse, ApiNoteDetail, ApiCreateNoteResponse } from '../types/kote-api.types.js';

export class ApiClient {
  constructor(private readonly config: CliConfig) {}

  private async request(path: string, options: RequestInit = {}): Promise<Response> {
    const apiBase = this.config.apiUrl.replace(/\/$/, '');
    const cleanPath = path.replace(/^\//, '');
    const url = `${apiBase}/${cleanPath}`;

    const headers = new Headers(options.headers || {});
    
    // Attach authorization cookies
    if (this.config.cookies.kb_access_token || this.config.cookies.kb_refresh_token) {
      const cookieParts: string[] = [];
      if (this.config.cookies.kb_access_token) {
        cookieParts.push(`kb_access_token=${this.config.cookies.kb_access_token}`);
      }
      if (this.config.cookies.kb_refresh_token) {
        cookieParts.push(`kb_refresh_token=${this.config.cookies.kb_refresh_token}`);
      }
      headers.set('Cookie', cookieParts.join('; '));
    }

    // Set common headers
    if (options.body && !headers.has('Content-Type')) {
      headers.set('Content-Type', 'application/json');
    }

    StderrLogger.debug(`HTTP Request: ${options.method || 'GET'} ${url}`);
    
    const response = await fetch(url, { ...options, headers });
    
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
    let path = `api/query?${urlParams.toString()}`;
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
    const response = await this.request(`api/notes/${encodeURIComponent(id)}`, {
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

    const response = await this.request('api/notes', {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });

    return response.json() as Promise<ApiCreateNoteResponse>;
  }

  async listProjects(): Promise<ApiProject[]> {
    const response = await this.request('api/projects?limit=100', {
      method: 'GET',
    });
    const data = await response.json() as { ok: boolean; projects: ApiProject[] };
    return data.projects || [];
  }
}
