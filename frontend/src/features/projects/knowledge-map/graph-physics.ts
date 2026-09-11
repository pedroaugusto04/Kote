import * as d3 from 'd3';
import type { KnowledgeMapLink, KnowledgeMapNode } from '../../../shared/api/models/project-knowledge-map';
import { knowledgeMapNodeStyles, knowledgeMapReviewNodeStyle } from './knowledge-map.constants';

export type GraphNode = KnowledgeMapNode & d3.SimulationNodeDatum;
export type GraphLink = Omit<KnowledgeMapLink, 'source' | 'target'> & d3.SimulationLinkDatum<GraphNode>;

export const TOPIC_COLORS = [
  '#a855f7',
  '#06b6d4',
  '#ec4899',
  '#f59e0b',
  '#10b981',
  '#6366f1',
  '#3b82f6',
  '#14b8a6',
];

export function hashNodeId(id: string): number {
  let hash = 0;
  for (let index = 0; index < id.length; index += 1) {
    hash = (hash * 31 + id.charCodeAt(index)) >>> 0;
  }
  return hash;
}

export function isReviewNote(item: GraphNode): boolean {
  return item.type === 'note' && Boolean(item.isReview);
}

export function nodeColor(item: GraphNode): string {
  if (isReviewNote(item)) return knowledgeMapReviewNodeStyle.color;
  if (item.type === 'topic') {
    const idx = hashNodeId(item.id) % TOPIC_COLORS.length;
    return TOPIC_COLORS[idx];
  }
  return knowledgeMapNodeStyles[item.type].color;
}

export function graphLinkNode(value: string | number | GraphNode): GraphNode {
  return typeof value === 'object' ? value : ({ x: 0, y: 0 } as GraphNode);
}

export function linkDistance(item: GraphLink): number {
  const sourceId = typeof item.source === 'object' ? item.source.id : String(item.source);
  const targetId = typeof item.target === 'object' ? item.target.id : String(item.target);
  const sourceIsTopic = sourceId.startsWith('topic:');
  const targetIsTopic = targetId.startsWith('topic:');

  // Intra-cluster link (between topic hub and member note)
  if ((sourceIsTopic && !targetIsTopic) || (targetIsTopic && !sourceIsTopic)) {
    const nonTopicId = sourceIsTopic ? targetId : sourceId;
    if (!nonTopicId.startsWith('project:') && !nonTopicId.startsWith('folder:')) {
      return 50;
    }
  }

  if (sourceIsTopic || targetIsTopic) return 160;
  if (item.type === 'contains') return 125;
  if (item.type === 'filed-in' || item.type === 'from-repository') return 110;
  return 95;
}

export function linkStrength(item: GraphLink): number {
  if (item.strength !== undefined) return item.strength;
  const sourceId = typeof item.source === 'object' ? item.source.id : String(item.source);
  const targetId = typeof item.target === 'object' ? item.target.id : String(item.target);
  if (sourceId.startsWith('topic:') || targetId.startsWith('topic:')) return 0.85;
  if (item.type === 'contains') return 0.75;
  if (item.type === 'filed-in') return 0.6;
  if (item.type === 'from-repository') return 0.45;
  return 0.15;
}

export function chargeStrength(item: GraphNode, denseMap: boolean, hiddenChildIds?: Set<string> | null): number {
  if (hiddenChildIds?.has(item.id)) return 0;
  const base = item.type === 'project' ? -380 : item.type === 'topic' ? -320 : item.type === 'note' ? -130 : -160;
  return denseMap ? base * 1.3 : base;
}

export function collisionRadius(item: GraphNode, hiddenChildIds?: Set<string> | null): number {
  if (hiddenChildIds?.has(item.id)) return 0;
  const radius = item.size || knowledgeMapNodeStyles[item.type].radius;
  if (item.type === 'topic') return radius + 30;
  if (isReviewNote(item)) return radius + 16;
  const labelAllowance = item.type === 'note' ? 26 : item.type === 'tag' ? 20 : 30;
  return radius + labelAllowance;
}

export function shouldShowLabel(
  item: GraphNode,
  zoomScale: number,
  activeNodeId: string,
  isLargeGraph: boolean,
): boolean {
  if (item.id === activeNodeId) return true;
  if (item.type === 'project' || item.type === 'repository' || item.type === 'folder' || item.type === 'topic') return true;

  const thresholdOffset = isLargeGraph ? 0.3 : 0;

  if (item.type === 'note') {
    if (isReviewNote(item)) return zoomScale >= (1.35 + thresholdOffset);
    return zoomScale >= (0.95 + thresholdOffset);
  }
  if (item.type === 'tag' || item.type === 'category') return zoomScale >= (1.25 + thresholdOffset);
  return zoomScale >= (1.5 + thresholdOffset);
}

export function graphNodePosition(
  item: GraphNode,
  time: number,
  staticPosition: boolean,
): { x: number; y: number } {
  const x = item.x || 0;
  const y = item.y || 0;
  if (staticPosition) return { x, y };
  const phase = hashNodeId(item.id) % 628;
  const amplitude = item.type === 'project' ? 0.8 : 1.7;
  const t = time / 1600;
  return {
    x: x + Math.sin(t + phase) * amplitude,
    y: y + Math.cos(t * 0.85 + phase) * amplitude,
  };
}

export function computeFitTransform(
  nodes: GraphNode[],
  hiddenNodeIds: Set<string> | null | undefined,
  width: number,
  height: number,
): d3.ZoomTransform {
  if (nodes.length === 0) {
    return d3.zoomIdentity;
  }

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let validCount = 0;
  const hidden = hiddenNodeIds ?? new Set<string>();

  nodes.forEach((n) => {
    if (n.x === undefined || n.y === undefined || hidden.has(n.id)) return;
    minX = Math.min(minX, n.x);
    minY = Math.min(minY, n.y);
    maxX = Math.max(maxX, n.x);
    maxY = Math.max(maxY, n.y);
    validCount += 1;
  });

  if (validCount === 0) {
    return d3.zoomIdentity;
  }

  const padding = 50;
  const graphW = maxX - minX + padding * 2;
  const graphH = maxY - minY + padding * 2;
  const centerX = (minX + maxX) / 2;
  const centerY = (minY + maxY) / 2;

  const scale = Math.min(
    width / graphW,
    height / graphH,
    1.5,
  );
  const finalScale = Math.max(0.25, scale);

  return d3.zoomIdentity
    .translate(width / 2, height / 2)
    .scale(finalScale)
    .translate(-centerX, -centerY);
}
