import type { ProjectTimelineCategory, ProjectTimelineItemCategory } from './project-timeline';

export const knowledgeMapNodeTypeValues = ['project', 'repository', 'folder', 'note', 'tag', 'category'] as const;
export const knowledgeMapLinkTypeValues = ['contains', 'filed-in', 'tagged-with', 'from-repository', 'classified-as'] as const;

export type KnowledgeMapNodeType = (typeof knowledgeMapNodeTypeValues)[number];
export type KnowledgeMapLinkType = (typeof knowledgeMapLinkTypeValues)[number];

export type KnowledgeMapNode = {
  id: string;
  type: KnowledgeMapNodeType;
  label: string;
  subtitle?: string;
  noteId?: string;
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
