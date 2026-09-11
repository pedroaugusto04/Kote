import type { KnowledgeMapLinkType, KnowledgeMapNodeType } from '../../../shared/api/models/project-knowledge-map';

export type KnowledgeMapVisibleNodeType = KnowledgeMapNodeType | 'review-note';

export const visibleKnowledgeMapNodeTypes: KnowledgeMapVisibleNodeType[] = ['project', 'repository', 'folder', 'note', 'review-note', 'tag', 'category', 'topic'];
export const defaultVisibleKnowledgeMapNodeTypes = new Set<KnowledgeMapVisibleNodeType>(['project', 'repository', 'folder', 'note', 'review-note', 'topic']);
export const knowledgeMapLimitOptions = [40, 80, 120, 150] as const;

export const knowledgeMapNodeStyles: Record<KnowledgeMapNodeType, { label: string; color: string; radius: number }> = {
  project: { label: 'Project', color: '#d97706', radius: 22 },
  repository: { label: 'Repository', color: '#0284c7', radius: 15 },
  folder: { label: 'Folder', color: '#7c3aed', radius: 13 },
  note: { label: 'Note', color: '#16a34a', radius: 10 },
  tag: { label: 'Tag', color: '#dc2626', radius: 9 },
  category: { label: 'Category', color: '#ea580c', radius: 10 },
  topic: { label: 'Topic', color: '#9333ea', radius: 20 },
};

export const knowledgeMapReviewNodeStyle = { label: 'Review notes', color: '#c026d3', radius: knowledgeMapNodeStyles.note.radius };

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
  contains: { stroke: '#94a3b8', width: 1.2 },
  'filed-in': { stroke: '#a78bfa', width: 1.4 },
  'tagged-with': { stroke: '#f87171', width: 1 },
  'from-repository': { stroke: '#38bdf8', width: 1.7 },
  'classified-as': { stroke: '#fb923c', width: 1 },
};
