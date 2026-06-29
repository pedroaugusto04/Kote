import type { PaginationMeta } from './pagination.models.js';
import type { CategoryRecord } from './repository-records.models.js';

export const projectTimelineCategories = ['all', 'whatsapp', 'github-push', 'manual', 'reminder', 'ai-chat'] as const;

export type ProjectTimelineCategory = (typeof projectTimelineCategories)[number];
export type ProjectTimelineFilterCategory = Exclude<ProjectTimelineCategory, 'all'>;

export type ProjectTimelineItem = {
  id: string;
  noteId: string;
  title: string;
  summary: string;
  project: string;
  workspace: string;
  folderId: string | null;
  categories: CategoryRecord[];
  type: string;
  category: ProjectTimelineFilterCategory;
  status: string;
  source: string;
  sourceChannel: string;
  date: string;
  tags: string[];
  path: string;
  attachmentCount: number;
};

export type ListProjectTimelineInput = {
  projectId?: string;
  folderId?: string;
  folderIds?: string[];
  page: number;
  pageSize: number;
  category: ProjectTimelineCategory;
  status?: string;
  /** When false, pinned notes are not sorted to the top. Defaults to true. */
  orderByPin?: boolean;
};

export type PaginatedProjectTimeline = {
  items: ProjectTimelineItem[];
  pagination: PaginationMeta;
};
