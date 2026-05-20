import type { PaginationMeta } from './pagination.models.js';

export const projectTimelineCategories = ['all', 'whatsapp', 'github-push', 'manual', 'reminder', 'decision'] as const;

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
  projectSlug?: string;
  folderId?: string;
  page: number;
  pageSize: number;
  category: ProjectTimelineCategory;
};

export type PaginatedProjectTimeline = {
  items: ProjectTimelineItem[];
  pagination: PaginationMeta;
};
