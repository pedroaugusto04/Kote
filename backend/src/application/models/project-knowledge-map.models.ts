import type { ProjectTimelineCategory, ProjectTimelineFilterCategory } from './project-timeline.models.js';

export const KnowledgeMapNodeTypeEnum = {
  Project: 'project',
  Repository: 'repository',
  Folder: 'folder',
  Note: 'note',
  Tag: 'tag',
  Category: 'category',
  Topic: 'topic',
} as const;

export const knowledgeMapNodeTypes = Object.values(KnowledgeMapNodeTypeEnum);
export type KnowledgeMapNodeType = (typeof KnowledgeMapNodeTypeEnum)[keyof typeof KnowledgeMapNodeTypeEnum];
export const knowledgeMapLinkTypes = ['contains', 'filed-in', 'tagged-with', 'from-repository', 'classified-as'] as const;

export type KnowledgeMapLinkType = (typeof knowledgeMapLinkTypes)[number];

export type KnowledgeMapNode = {
  id: string;
  type: KnowledgeMapNodeType;
  label: string;
  subtitle?: string;
  noteId?: string;
  childNoteIds?: string[];
  childCount?: number;
  projectSlug?: string;
  category?: string;
  status?: string;
  date?: string;
  size?: number;
  isReview?: boolean;
};

export type KnowledgeMapLink = {
  id: string;
  source: string;
  target: string;
  type: KnowledgeMapLinkType;
  strength?: number;
};

export type ProjectKnowledgeMapStats = {
  noteCount: number;
  tagCount: number;
  folderCount: number;
  repositoryCount: number;
};

export type ProjectKnowledgeMapResponse = {
  ok: true;
  projectSlug: string;
  nodes: KnowledgeMapNode[];
  links: KnowledgeMapLink[];
  stats: ProjectKnowledgeMapStats;
};

export type ListProjectKnowledgeMapInput = {
  projectId: string;
  folderId?: string;
  folderIds?: string[];
  limit: number;
  category: ProjectTimelineCategory;
  excludeReviewNotes?: boolean;
};

export type ProjectKnowledgeMapNoteCategory = ProjectTimelineFilterCategory;
