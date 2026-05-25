import type { KnowledgeMapLink, KnowledgeMapNode } from '../../../shared/api/models/project-knowledge-map';
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
    if (node.type === 'note') {
      if (node.isReview && !visibleTypes.has('review-note')) return false;
      if (node.date && maxDateFilter !== undefined && maxDateFilter !== null) {
        if (new Date(node.date).getTime() > maxDateFilter) return false;
      }
    }
    return true;
  });

  const visibleNoteIds = new Set(nodes.filter((n) => n.type === 'note').map((n) => n.id));
  const activeFolders = new Set<string>();
  const activeTags = new Set<string>();
  const activeCategories = new Set<string>();
  const activeRepositories = new Set<string>();

  dataset.links.forEach((link) => {
    const sourceIsNote = visibleNoteIds.has(link.source);
    const targetIsNote = visibleNoteIds.has(link.target);

    if (sourceIsNote || targetIsNote) {
      const otherId = sourceIsNote ? link.target : link.source;
      if (otherId.startsWith('folder:')) activeFolders.add(otherId);
      if (otherId.startsWith('tag:')) activeTags.add(otherId);
      if (otherId.startsWith('category:')) activeCategories.add(otherId);
      if (otherId.startsWith('repository:')) activeRepositories.add(otherId);
    }
  });

  // Propagate active folders upwards for parent folders
  let changed = true;
  while (changed) {
    changed = false;
    dataset.links.forEach((link) => {
      if (link.type === 'contains' && link.source.startsWith('folder:') && link.target.startsWith('folder:')) {
        if (activeFolders.has(link.target) && !activeFolders.has(link.source)) {
          activeFolders.add(link.source);
          changed = true;
        }
      }
    });
  }

  nodes = nodes.filter((node) => {
    if (node.type === 'project') return true;
    if (node.type === 'note') return true;
    if (node.type === 'folder') return activeFolders.has(node.id);
    if (node.type === 'tag') return activeTags.has(node.id);
    if (node.type === 'category') return activeCategories.has(node.id);
    if (node.type === 'repository') return activeRepositories.has(node.id);
    return false;
  });

  const finalNodeIds = new Set(nodes.map((node) => node.id));
  const links = dataset.links.filter((link) => finalNodeIds.has(link.source) && finalNodeIds.has(link.target));

  return { nodes, links };
}

export function knowledgeMapFolderIdFromNodeId(nodeId: string) {
  return nodeId.startsWith('folder:') ? nodeId.slice('folder:'.length) : '';
}
