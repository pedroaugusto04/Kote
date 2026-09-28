import type { KnowledgeMapLinkType, KnowledgeMapNodeType } from '../../../shared/api/models/project-knowledge-map';

export type KnowledgeMapVisibleNodeType = KnowledgeMapNodeType | 'review-note';

export const visibleKnowledgeMapNodeTypes: KnowledgeMapVisibleNodeType[] = ['project', 'repository', 'folder', 'note', 'review-note', 'tag', 'category', 'topic'];
export const defaultVisibleKnowledgeMapNodeTypes = new Set<KnowledgeMapVisibleNodeType>(['project', 'repository', 'folder', 'note', 'review-note', 'topic']);
export const knowledgeMapLimitOptions = [40, 80, 120, 150] as const;
export const knowledgeMapLabelLayout = {
  topicMaxLength: 28,
  nodeMaxLength: 34,
  offset: 12,
  estimatedCharacterWidth: 8,
} as const;

export const knowledgeMapNodeStyles: Record<KnowledgeMapNodeType, { label: string; color: string; radius: number }> = {
  project: { label: 'Project', color: 'var(--amber)', radius: 54 },
  repository: { label: 'Repository', color: 'var(--muted)', radius: 34 },
  folder: { label: 'Folder', color: 'var(--muted)', radius: 30 },
  note: { label: 'Note', color: 'var(--muted)', radius: 24 },
  tag: { label: 'Tag', color: 'var(--muted)', radius: 22 },
  category: { label: 'Category', color: 'var(--muted)', radius: 24 },
  topic: { label: 'Topic', color: 'var(--purple)', radius: 60 },
};

export const knowledgeMapReviewNodeStyle = { label: 'Review notes', color: 'var(--muted)', radius: knowledgeMapNodeStyles.note.radius };

// Shared SVG geometry for the graph and its legend (24 × 24 viewBox).
export const knowledgeMapNodeIcons: Record<KnowledgeMapVisibleNodeType, string> = {
  project: 'm12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2-5.6-3-5.6 3 1.1-6.2L3 9.6l6.2-.9Z',
  repository: 'M7 3v12a4 4 0 0 0 4 4h6M7 7h10V3M17 7v6M5 3h4M15 3h4M15 13h4M15 19h4',
  folder: 'M3 7V5h6l2 2h10v12H3Z',
  note: 'M6 3h8l4 4v14H6ZM14 3v5h4M9 12h6M9 16h6',
  'review-note': 'M6 3h8l4 4v14H6ZM14 3v5h4m-9 7 2 2 4-4',
  tag: 'M4 4h7l9 9-7 7-9-9ZM8 8h.01',
  category: 'M3 3h7v7H3ZM14 3h7v7h-7ZM3 14h7v7H3ZM14 14h7v7h-7Z',
  topic: 'm12 3 9 5-9 5-9-5Zm-9 9 9 5 9-5M3 16l9 5 9-5',
};

export const knowledgeMapVisibleNodeLabels: Record<KnowledgeMapVisibleNodeType, string> = {
  project: knowledgeMapNodeStyles.project.label,
  repository: knowledgeMapNodeStyles.repository.label,
  folder: knowledgeMapNodeStyles.folder.label,
  note: knowledgeMapNodeStyles.note.label,
  'review-note': knowledgeMapReviewNodeStyle.label,
  tag: knowledgeMapNodeStyles.tag.label,
  category: knowledgeMapNodeStyles.category.label,
  topic: knowledgeMapNodeStyles.topic.label,
};

export const knowledgeMapLinkStyles: Record<KnowledgeMapLinkType, { stroke: string; width: number }> = {
  contains: { stroke: 'var(--muted)', width: 1 },
  'filed-in': { stroke: 'var(--muted)', width: 1 },
  'tagged-with': { stroke: 'var(--muted)', width: 1 },
  'from-repository': { stroke: 'var(--muted)', width: 1 },
  'classified-as': { stroke: 'var(--muted)', width: 1 },
};
