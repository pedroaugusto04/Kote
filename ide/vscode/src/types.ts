// ---------------------------------------------------------------------------
// Ask history
// ---------------------------------------------------------------------------

export interface AskHistoryEntry {
  id: string;
  question: string;
  answer: string;
  projectSlug: string;
  timestamp: string; // ISO 8601
}

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

export interface KbConfig {
  apiUrl: string;
  workspaceSlug: string;
  defaultProjectSlug: string;
  cookies: {
    kb_access_token?: string;
    kb_refresh_token?: string;
  };
}

// ---------------------------------------------------------------------------
// API models
// ---------------------------------------------------------------------------

export interface KbProject {
  projectSlug: string;
  displayName: string;
  workspaceSlug: string;
  enabled: boolean;
}

export interface KbNote {
  id: string;
  title: string;
  path: string;
  projectSlug: string;
  canonicalType: string;
  status: string;
  createdAt: string;
  updatedAt: string;
}

export interface KbReminder {
  id: string;
  title: string;
  projectSlug: string;
  status: string;
  reminderAt?: string;
  reminderDate?: string;
}

export interface KbAskResult {
  ok: boolean;
  answer: string;
  confidence: string | number;
  sources: Array<{ title: string; path: string; projectSlug: string }>;
  media?: Array<{
    noteId: string;
    attachmentId: string;
    mediaType: 'image' | 'video' | 'audio' | 'document';
    mimeType: string;
    fileName: string;
    sizeBytes: number;
    mediaBase64: string;
  }>;
}

export interface KbCreateNotePayload {
  title?: string;
  rawText: string;
  projectSlug: string;
  tags?: string[];
  sourceChannel?: string;
  source?: string;
  sessionId?: string;
  occurredAt?: string;
  path?: string;
  metadata?: {
    changedFiles?: string[];
    [key: string]: any;
  };
  attachments?: Array<{
    fileName: string;
    mimeType: string;
    sizeBytes: number;
    dataBase64: string;
  }>;
}

export interface KbCreateNoteResult {
  noteId: string;
  id?: string;
}

// ---------------------------------------------------------------------------
// Webview message protocols
// Each channel is a discriminated union so the switch exhaustiveness is
// type-checked on both sides.
// ---------------------------------------------------------------------------

// Sidebar (extension → webview)
export type SidebarToWebview =
  | { type: 'init'; workspace: string; project: string; projects: KbProject[]; notes: KbNote[]; reminders: KbReminder[] }
  | { type: 'refresh'; notes: KbNote[]; reminders: KbReminder[] }
  | { type: 'projectChanged'; project: string; notes: KbNote[]; reminders: KbReminder[] }
  | { type: 'error'; message: string }
  | { type: 'loading' };

// Sidebar (webview → extension)
export type SidebarFromWebview =
  | { type: 'ready' }
  | { type: 'changeProject'; projectSlug: string }
  | { type: 'openChat' }
  | { type: 'refresh' };

// Chat (extension → webview)
export type ChatToWebview =
  | { type: 'answer'; answer: string; confidence: string | number; sources: Array<{ title: string; path: string }> }
  | { type: 'projects'; projects: KbProject[] }
  | { type: 'setProject'; projectSlug: string }
  | { type: 'noteSaved'; noteId: string }
  | { type: 'injectQA'; question: string; answer: string; projectSlug: string }
  | { type: 'historyLoaded'; entries: AskHistoryEntry[] }
  | { type: 'error'; message: string }
  | { type: 'thinking' };

// Chat (webview → extension)
export type ChatFromWebview =
  | { type: 'ready' }
  | { type: 'ask'; question: string; projectSlug: string }
  | { type: 'saveNote'; content: string; projectSlug: string; title?: string }
  | { type: 'loadHistory' }
  | { type: 'clearHistory' };
