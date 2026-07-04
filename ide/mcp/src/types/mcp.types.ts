export interface CliConfig {
  apiUrl: string;
  workspaceSlug: string;
  defaultProjectSlug: string;
  cookies: {
    kb_access_token?: string;
    kb_refresh_token?: string;
  };
}

export interface SearchNotesArgs {
  query: string;
  projectSlug?: string;
}

export interface GetNoteArgs {
  id: string;
}

export interface CreateNoteArgs {
  title: string;
  markdown: string;
  projectSlug?: string;
}
