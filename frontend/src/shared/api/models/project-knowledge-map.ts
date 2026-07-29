import type { ProjectTimelineCategory, ProjectTimelineItemCategory } from './project-timeline';

export const KnowledgeMapNodeTypeEnum = {
  Project: 'project',
  Repository: 'repository',
  Folder: 'folder',
  Note: 'note',
  Tag: 'tag',
  Category: 'category',
  Topic: 'topic',
} as const;

export const knowledgeMapNodeTypeValues = Object.values(KnowledgeMapNodeTypeEnum);
export type KnowledgeMapNodeType = (typeof KnowledgeMapNodeTypeEnum)[keyof typeof KnowledgeMapNodeTypeEnum];
export const knowledgeMapLinkTypeValues = ['contains', 'filed-in', 'tagged-with', 'from-repository', 'classified-as'] as const;

export type KnowledgeMapLinkType = (typeof knowledgeMapLinkTypeValues)[number];

export type KnowledgeMapNode = {
  id: string;
  type: KnowledgeMapNodeType;
  label: string;
  subtitle?: string;
  noteId?: string;
  childNoteIds?: string[];
  childCount?: number;
  projectSlug?: string;
  category?: ProjectTimelineItemCategory;
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

export type ProjectKnowledgeMapResponse = {
  ok: true;
  projectSlug: string;
  nodes: KnowledgeMapNode[];
  links: KnowledgeMapLink[];
  stats: {
    noteCount: number;
    tagCount: number;
    folderCount: number;
    repositoryCount: number;
  };
};

export type ProjectKnowledgeMapQuery = {
  limit?: number;
  category?: ProjectTimelineCategory;
  folderId?: string;
  excludeReviewNotes?: boolean;
};
