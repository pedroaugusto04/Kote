import type { NoteStatus } from './note-status';

export const projectTimelineCategoryValues = ['all', 'whatsapp', 'github-push', 'manual', 'reminder', 'decision', 'ai-chat'] as const;

export type ProjectTimelineCategory = (typeof projectTimelineCategoryValues)[number];
export type ProjectTimelineItemCategory = Exclude<ProjectTimelineCategory, 'all'>;

export type ProjectTimelineItem = {
  id: string;
  noteId: string;
  title: string;
  summary: string;
  project: string;
  workspace: string;
  folderId: string | null;
  type: string;
  category: ProjectTimelineItemCategory;
  status: NoteStatus;
  source: string;
  sourceChannel: string;
  date: string;
  tags: string[];
  path: string;
  attachmentCount: number;
  isPinned?: boolean;
}; 
