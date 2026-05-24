import type { KnowledgeMapLink, KnowledgeMapNode, KnowledgeMapNodeType } from '../../../shared/api/models/project-knowledge-map';

export type KnowledgeMapDataset = {
  nodes: KnowledgeMapNode[];
  links: KnowledgeMapLink[];
};

export function filterKnowledgeMapDataset(
  dataset: KnowledgeMapDataset,
  visibleTypes: ReadonlySet<KnowledgeMapNodeType>,
): KnowledgeMapDataset {
  const nodes = dataset.nodes.filter((node) => visibleTypes.has(node.type));
  const visibleNodeIds = new Set(nodes.map((node) => node.id));
  const links = dataset.links.filter((link) => visibleNodeIds.has(link.source) && visibleNodeIds.has(link.target));
  return { nodes, links };
}

export function knowledgeMapFolderIdFromNodeId(nodeId: string) {
  return nodeId.startsWith('folder:') ? nodeId.slice('folder:'.length) : '';
}
