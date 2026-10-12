import * as d3 from 'd3';
import type { GraphNode, GraphLink } from './graph-physics';
import { TOPIC_COLORS, hashNodeId, graphNodePosition, isReviewNote, graphLinkNode } from './graph-physics';
import { knowledgeMapLabelLayout, knowledgeMapNodeStyles, knowledgeMapNodeIcons } from './knowledge-map.constants';

/**
 * Pre-distributes initial positions so topic hub nodes are radially balanced
 * and all other nodes follow a gentle golden spiral, eliminating (0,0) overlaps.
 */
export function initializeNodePositions(
  graphNodes: GraphNode[],
  width: number,
  height: number,
): void {
  const topicNodesList = graphNodes.filter((n) => n.type === 'topic');
  const totalTopics = topicNodesList.length;
  const centerX = width / 2;
  const centerY = height / 2;
  const topicRadius = Math.min(centerX, centerY) * 0.45;

  topicNodesList.forEach((topicNode, idx) => {
    const angle = (idx / Math.max(1, totalTopics)) * 2 * Math.PI - Math.PI / 2;
    topicNode.x = centerX + Math.cos(angle) * topicRadius;
    topicNode.y = centerY + Math.sin(angle) * topicRadius;
  });

  const otherNodes = graphNodes.filter((n) => n.type !== 'topic' && n.type !== 'project');
  const goldenAngle = 2.39996;
  otherNodes.forEach((otherNode, i) => {
    if (otherNode.x === undefined || otherNode.x === 0 || isNaN(otherNode.x)) {
      const r = Math.sqrt(i + 1) * 20 + 45;
      const angle = i * goldenAngle;
      otherNode.x = centerX + Math.cos(angle) * r;
      otherNode.y = centerY + Math.sin(angle) * r;
    }
  });
}

/**
 * Builds a lookup map from node ID to its parent topic's color for visual clustering.
 */
export function buildNoteToTopicColorMap(graphNodes: GraphNode[]): Map<string, string> {
  const noteToTopicColorMap = new Map<string, string>();
  graphNodes.forEach((item) => {
    if (item.type === 'topic' && item.childNoteIds) {
      const color = TOPIC_COLORS[hashNodeId(item.id) % TOPIC_COLORS.length];
      item.childNoteIds.forEach((cid) => noteToTopicColorMap.set(cid, color));
    }
  });
  return noteToTopicColorMap;
}

/**
 * Computes SVG path string for a convex hull around a topic and its expanded child notes.
 */
export function computeClusterHullPath(
  topic: GraphNode,
  members: GraphNode[],
  time: number,
  isDriftDisabled: boolean,
): string | null {
  if (!members.length) return null;
  const corners: [number, number][] = [topic, ...members].flatMap((item) => {
    const { x, y } = graphNodePosition(item, time, isDriftDisabled);
    const padding = (item.size || knowledgeMapNodeStyles[item.type].radius) + 18;
    return [
      [x - padding, y - padding],
      [x + padding, y - padding],
      [x + padding, y + padding],
      [x - padding, y + padding],
    ] as [number, number][];
  });
  const hull = d3.polygonHull(corners);
  return hull ? `M${hull.map((point) => point.join(',')).join('L')}Z` : null;
}

/**
 * Computes search matching node IDs and 1-hop neighbor node IDs for hover/focus states.
 */
export function computeGraphFocusSets(
  graphNodes: GraphNode[],
  graphLinks: GraphLink[],
  hoveredId: string | null,
  searchStr: string,
): { matchesSearch: Set<string>; neighbors: Set<string>; hasSearch: boolean; hasHover: boolean } {
  const search = searchStr.trim().toLowerCase();
  const hasSearch = search.length > 0;
  const hasHover = hoveredId !== null;

  const matchesSearch = new Set<string>();
  if (hasSearch) {
    graphNodes.forEach((n) => {
      if (n.label.toLowerCase().includes(search)) {
        matchesSearch.add(n.id);
      }
    });

    graphLinks.forEach((l) => {
      if (l.type === 'tagged-with') {
        const sourceId = typeof l.source === 'object' ? l.source.id : String(l.source);
        const targetId = typeof l.target === 'object' ? l.target.id : String(l.target);
        if (matchesSearch.has(targetId)) {
          matchesSearch.add(sourceId);
        }
        if (matchesSearch.has(sourceId)) {
          matchesSearch.add(targetId);
        }
      }
    });
  }

  const neighbors = new Set<string>();
  if (hasHover) {
    neighbors.add(hoveredId!);
    graphLinks.forEach((l) => {
      const sourceId = typeof l.source === 'object' ? l.source.id : String(l.source);
      const targetId = typeof l.target === 'object' ? l.target.id : String(l.target);
      if (sourceId === hoveredId) neighbors.add(targetId);
      if (targetId === hoveredId) neighbors.add(sourceId);
    });
  }

  return { matchesSearch, neighbors, hasSearch, hasHover };
}

export interface NodeVisualElements {
  circles: d3.Selection<SVGCircleElement, GraphNode, SVGGElement, unknown>;
  topicNodes: d3.Selection<SVGGElement, GraphNode, SVGGElement, unknown>;
  labels: d3.Selection<SVGTextElement, GraphNode, SVGGElement, unknown>;
  labelWidths: WeakMap<SVGTextElement, { text: string; width: number }>;
}

/**
 * Appends node visual bodies, topic badges, vector icons, expand indicators, labels, and titles.
 */
export function appendNodeVisualElements(
  node: d3.Selection<SVGGElement, GraphNode, SVGGElement, unknown>,
): NodeVisualElements {
  const circles = node
    .append('circle')
    .attr('class', 'knowledge-map-node-body')
    .attr('r', (item) => item.size || knowledgeMapNodeStyles[item.type].radius)
    .attr('stroke-width', 1.5);

  const topicNodes = node.filter((item) => item.type === 'topic' && Boolean(item.childCount));

  topicNodes
    .append('circle')
    .attr('class', 'knowledge-map-count-body')
    .attr('cx', (item) => (item.size || knowledgeMapNodeStyles[item.type].radius) * 0.75)
    .attr('cy', (item) => -(item.size || knowledgeMapNodeStyles[item.type].radius) * 0.75)
    .attr('r', 16)
    .attr('stroke-width', 1.5);

  topicNodes
    .append('text')
    .attr('class', 'knowledge-map-count-label')
    .attr('x', (item) => (item.size || knowledgeMapNodeStyles[item.type].radius) * 0.75)
    .attr('y', (item) => -(item.size || knowledgeMapNodeStyles[item.type].radius) * 0.75 + 0.5)
    .attr('text-anchor', 'middle')
    .attr('dominant-baseline', 'central')
    .attr('font-size', '12px')
    .attr('font-weight', 'bold')
    .style('pointer-events', 'none')
    .text((item) => String(item.childCount || 0));

  node
    .append('path')
    .attr('class', 'knowledge-map-node-icon')
    .attr('transform', (item) => {
      const radius = item.size || knowledgeMapNodeStyles[item.type].radius;
      const size = Math.max(12, radius);
      return `translate(${-size / 2},${-size / 2}) scale(${size / 24})`;
    })
    .attr('d', (item) => knowledgeMapNodeIcons[isReviewNote(item) ? 'review-note' : item.type]);

  topicNodes
    .append('text')
    .attr('class', 'knowledge-map-expand-indicator')
    .attr('text-anchor', 'middle')
    .attr('y', (item) => (item.size || knowledgeMapNodeStyles.topic.radius) + 25);

  const labels = node
    .append('text')
    .attr('class', 'knowledge-map-node-label')
    .attr('x', (item) => (item.size || knowledgeMapNodeStyles[item.type].radius) + knowledgeMapLabelLayout.offset)
    .attr('y', 4)
    .text((item) => item.label);

  const labelWidths = new WeakMap<SVGTextElement, { text: string; width: number }>();

  node.append('title').text((item) => [item.label, item.subtitle, item.date].filter(Boolean).join('\n'));

  return { circles, topicNodes, labels, labelWidths };
}

/**
 * Updates SVG line endpoint positions during animation frames.
 */
export function updateLinkPositions(
  links: d3.Selection<SVGLineElement, GraphLink, SVGGElement, unknown>,
  time: number,
  isDriftDisabled: boolean,
): void {
  links
    .attr('x1', (item) => graphNodePosition(graphLinkNode(item.source), time, isDriftDisabled).x)
    .attr('y1', (item) => graphNodePosition(graphLinkNode(item.source), time, isDriftDisabled).y)
    .attr('x2', (item) => graphNodePosition(graphLinkNode(item.target), time, isDriftDisabled).x)
    .attr('y2', (item) => graphNodePosition(graphLinkNode(item.target), time, isDriftDisabled).y);
}

/**
 * Updates SVG node group transform positions during animation frames.
 */
export function updateNodePositions(
  nodes: d3.Selection<SVGGElement, GraphNode, SVGGElement, unknown>,
  time: number,
  isDriftDisabled: boolean,
): void {
  nodes.attr('transform', (item) => {
    const position = graphNodePosition(item, time, isDriftDisabled);
    return `translate(${position.x},${position.y})`;
  });
}

