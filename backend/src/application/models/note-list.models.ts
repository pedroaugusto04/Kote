import type { PaginationMeta } from './pagination.models.js';
import type { VaultNoteSummary } from './vault-note.models.js';

export type ListNotesInput = {
  page: number;
  pageSize: number;
  workspaceSlug?: string;
  projectSlug?: string;
  selectedId?: string;
};

export type PaginatedNotes = {
  items: VaultNoteSummary[];
  pagination: PaginationMeta;
};
