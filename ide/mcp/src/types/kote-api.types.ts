export interface ApiProject {
  projectSlug: string;
  displayName: string;
  workspaceSlug: string;
  enabled: boolean;
  name?: string;
}

export interface ApiNoteSummary {
  id: string;
  title: string;
  snippet: string;
  path: string;
  project?: string;
  projectSlug?: string;
  date?: string;
}

export interface ApiSearchResponse {
  ok: boolean;
  query: string;
  matches?: ApiNoteSummary[];
  answer?: {
    answer: string;
    bullets: string[];
  };
}

export interface ApiNoteDetail {
  id: string;
  title: string;
  markdown: string;
  summary?: string;
  path: string;
  projectSlug?: string;
  workspaceId: string;
  occurredAt?: string;
  createdAt?: string;
}

export interface ApiCreateNoteResponse {
  noteId?: string;
  id?: string;
  ok?: boolean;
}
