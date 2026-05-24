import type { KnowledgeMapLinkType, KnowledgeMapNodeType } from '../../../shared/api/models/project-knowledge-map';

export type KnowledgeMapVisibleNodeType = KnowledgeMapNodeType | 'review-note';

export const visibleKnowledgeMapNodeTypes: KnowledgeMapVisibleNodeType[] = ['project', 'repository', 'folder', 'note', 'review-note', 'tag', 'category'];
export const defaultVisibleKnowledgeMapNodeTypes = new Set<KnowledgeMapVisibleNodeType>(['project', 'repository', 'folder', 'note', 'review-note']);
export const knowledgeMapLimitOptions = [40, 80, 120, 150] as const;

export const knowledgeMapNodeStyles: Record<KnowledgeMapNodeType, { label: string; color: string; radius: number }> = {
  project: { label: 'Project', color: '#f7c948', radius: 22 },
  repository: { label: 'Repository', color: '#7dd3fc', radius: 15 },
  folder: { label: 'Folder', color: '#c4b5fd', radius: 13 },
  note: { label: 'Note', color: '#86efac', radius: 10 },
  tag: { label: 'Tag', color: '#fca5a5', radius: 9 },
  category: { label: 'Category', color: '#fdba74', radius: 10 },
};

export const knowledgeMapReviewNodeStyle = { label: 'Review notes', color: '#e879f9', radius: knowledgeMapNodeStyles.note.radius };

export const knowledgeMapVisibleNodeLabels: Record<KnowledgeMapVisibleNodeType, string> = {
  project: knowledgeMapNodeStyles.project.label,
  repository: knowledgeMapNodeStyles.repository.label,
  folder: knowledgeMapNodeStyles.folder.label,
  note: knowledgeMapNodeStyles.note.label,
  'review-note': knowledgeMapReviewNodeStyle.label,
  tag: knowledgeMapNodeStyles.tag.label,
  category: knowledgeMapNodeStyles.category.label,
};

export const knowledgeMapLinkStyles: Record<KnowledgeMapLinkType, { stroke: string; width: number }> = {
  contains: { stroke: '#94a3b8', width: 1.2 },
  'filed-in': { stroke: '#c4b5fd', width: 1.4 },
  'tagged-with': { stroke: '#fca5a5', width: 1 },
  'from-repository': { stroke: '#7dd3fc', width: 1.7 },
  'classified-as': { stroke: '#fdba74', width: 1 },
};
