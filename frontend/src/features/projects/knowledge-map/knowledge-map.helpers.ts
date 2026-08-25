import { KnowledgeMapNodeTypeEnum, type KnowledgeMapLink, type KnowledgeMapNode } from '../../../shared/api/models/project-knowledge-map';
import type { KnowledgeMapVisibleNodeType } from './knowledge-map.constants';

export type KnowledgeMapDataset = {
  nodes: KnowledgeMapNode[];
  links: KnowledgeMapLink[];
};

export function filterKnowledgeMapDataset(
  dataset: KnowledgeMapDataset,
  visibleTypes: ReadonlySet<KnowledgeMapVisibleNodeType>,
  maxDateFilter?: number | null,
): KnowledgeMapDataset {
  let nodes = dataset.nodes.filter((node) => {
    if (!visibleTypes.has(node.type)) return false;
    if (node.type === KnowledgeMapNodeTypeEnum.Note) {
      if (node.isReview && !visibleTypes.has('review-note')) return false;
      if (node.category === 'dependency-watcher') return false;
      if (node.date && maxDateFilter !== undefined && maxDateFilter !== null) {
        if (new Date(node.date).getTime() > maxDateFilter) return false;
      }
    }
    return true;
  });

  const visibleItemIds = new Set(
    nodes.filter((n) => n.type === KnowledgeMapNodeTypeEnum.Note || n.type === KnowledgeMapNodeTypeEnum.Topic).map((n) => n.id),
  );
  const activeFolders = new Set<string>();
  const activeTags = new Set<string>();
  const activeCategories = new Set<string>();
  const activeRepositories = new Set<string>();

  dataset.links.forEach((link) => {
    const sourceIsItem = visibleItemIds.has(link.source);
    const targetIsItem = visibleItemIds.has(link.target);

    if (sourceIsItem || targetIsItem) {
      const otherId = sourceIsItem ? link.target : link.source;
      if (otherId.startsWith(`${KnowledgeMapNodeTypeEnum.Folder}:`)) activeFolders.add(otherId);
      if (otherId.startsWith(`${KnowledgeMapNodeTypeEnum.Tag}:`)) activeTags.add(otherId);
      if (otherId.startsWith(`${KnowledgeMapNodeTypeEnum.Category}:`)) activeCategories.add(otherId);
      if (otherId.startsWith(`${KnowledgeMapNodeTypeEnum.Repository}:`)) activeRepositories.add(otherId);
    }
  });

  // Propagate active folders upwards for parent folders
  let changed = true;
  while (changed) {
    changed = false;
    dataset.links.forEach((link) => {
      if (link.type === 'contains' && link.source.startsWith(`${KnowledgeMapNodeTypeEnum.Folder}:`) && link.target.startsWith(`${KnowledgeMapNodeTypeEnum.Folder}:`)) {
        if (activeFolders.has(link.target) && !activeFolders.has(link.source)) {
          activeFolders.add(link.source);
          changed = true;
        }
      }
    });
  }

  nodes = nodes.filter((node) => {
    if (node.type === KnowledgeMapNodeTypeEnum.Project) return true;
    if (node.type === KnowledgeMapNodeTypeEnum.Note) return true;
    if (node.type === KnowledgeMapNodeTypeEnum.Topic) return true;
    if (node.type === KnowledgeMapNodeTypeEnum.Folder) return activeFolders.has(node.id);
    if (node.type === KnowledgeMapNodeTypeEnum.Tag) return activeTags.has(node.id);
    if (node.type === KnowledgeMapNodeTypeEnum.Category) return activeCategories.has(node.id);
    if (node.type === KnowledgeMapNodeTypeEnum.Repository) return activeRepositories.has(node.id);
    return false;
  });

  const finalNodeIds = new Set(nodes.map((node) => node.id));
  const links = dataset.links.filter((link) => finalNodeIds.has(link.source) && finalNodeIds.has(link.target));

  return { nodes, links };
}

export function knowledgeMapFolderIdFromNodeId(nodeId: string) {
  const prefix = `${KnowledgeMapNodeTypeEnum.Folder}:`;
  return nodeId.startsWith(prefix) ? nodeId.slice(prefix.length) : '';
}
