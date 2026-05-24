import type { KnowledgeMapLink, KnowledgeMapNode } from '../../../shared/api/models/project-knowledge-map';
import type { KnowledgeMapVisibleNodeType } from './knowledge-map.constants';

export type KnowledgeMapDataset = {
  nodes: KnowledgeMapNode[];
  links: KnowledgeMapLink[];
};

export function filterKnowledgeMapDataset(
  dataset: KnowledgeMapDataset,
  visibleTypes: ReadonlySet<KnowledgeMapVisibleNodeType>,
): KnowledgeMapDataset {
  const nodes = dataset.nodes.filter((node) => {
    if (!visibleTypes.has(node.type)) return false;
    if (node.type === 'note' && node.isReview) return visibleTypes.has('review-note');
    return true;
  });
  const visibleNodeIds = new Set(nodes.map((node) => node.id));
  const links = dataset.links.filter((link) => visibleNodeIds.has(link.source) && visibleNodeIds.has(link.target));
  return { nodes, links };
}

export function knowledgeMapFolderIdFromNodeId(nodeId: string) {
  return nodeId.startsWith('folder:') ? nodeId.slice('folder:'.length) : '';
}
