import * as d3 from 'd3';
import { describe, expect, it } from 'vitest';
import {
  initializeNodePositions,
  buildNoteToTopicColorMap,
  computeClusterHullPath,
  computeGraphFocusSets,
  appendNodeVisualElements,
} from '../../../src/features/projects/knowledge-map/graph-elements';
import type { GraphNode, GraphLink } from '../../../src/features/projects/knowledge-map/graph-physics';

describe('graph-elements helpers', () => {
  it('initializeNodePositions arranges topics radially and other nodes spirally', () => {
    const nodes: GraphNode[] = [
      { id: 't1', type: 'topic', label: 'Topic 1' },
      { id: 't2', type: 'topic', label: 'Topic 2' },
      { id: 'n1', type: 'note', label: 'Note 1' },
      { id: 'n2', type: 'note', label: 'Note 2' },
    ];

    initializeNodePositions(nodes, 1000, 800);

    // Topics should be positioned
    expect(nodes[0].x).toBeDefined();
    expect(nodes[0].y).toBeDefined();
    expect(nodes[1].x).toBeDefined();
    expect(nodes[1].y).toBeDefined();

    // Notes should also be positioned
    expect(nodes[2].x).toBeDefined();
    expect(nodes[2].y).toBeDefined();
    expect(nodes[3].x).toBeDefined();
    expect(nodes[3].y).toBeDefined();
    expect(nodes[2].x).not.toBe(nodes[3].x);
  });

  it('buildNoteToTopicColorMap maps child note IDs to topic cluster colors', () => {
    const nodes: GraphNode[] = [
      { id: 't1', type: 'topic', label: 'Topic 1', childNoteIds: ['n1', 'n2'] },
      { id: 'n1', type: 'note', label: 'Note 1' },
      { id: 'n2', type: 'note', label: 'Note 2' },
    ];

    const map = buildNoteToTopicColorMap(nodes);
    expect(map.has('n1')).toBe(true);
    expect(map.has('n2')).toBe(true);
    expect(map.get('n1')).toBe(map.get('n2'));
  });

  it('computeClusterHullPath generates an SVG polygon path when members exist', () => {
    const topic: GraphNode = { id: 't1', type: 'topic', label: 'Topic', x: 100, y: 100 };
    const members: GraphNode[] = [
      { id: 'n1', type: 'note', label: 'Note 1', x: 80, y: 80 },
      { id: 'n2', type: 'note', label: 'Note 2', x: 120, y: 120 },
    ];

    const path = computeClusterHullPath(topic, members, 0, true);
    expect(path).toBeTruthy();
    expect(path?.startsWith('M')).toBe(true);
    expect(path?.endsWith('Z')).toBe(true);

    const emptyPath = computeClusterHullPath(topic, [], 0, true);
    expect(emptyPath).toBeNull();
  });

  it('computeGraphFocusSets finds search matches and 1-hop hover neighbors', () => {
    const nodes: GraphNode[] = [
      { id: 'n1', type: 'note', label: 'Auth Token' },
      { id: 'n2', type: 'note', label: 'Database Migration' },
      { id: 'n3', type: 'note', label: 'Other' },
    ];
    const links: GraphLink[] = [
      { id: 'l1', source: 'n1', target: 'n2', type: 'tagged-with' },
    ];

    const searchResult = computeGraphFocusSets(nodes, links, null, 'auth');
    expect(searchResult.hasSearch).toBe(true);
    expect(searchResult.matchesSearch.has('n1')).toBe(true);
    // tagged-with link expands cluster to include n2
    expect(searchResult.matchesSearch.has('n2')).toBe(true);
    expect(searchResult.matchesSearch.has('n3')).toBe(false);

    const hoverResult = computeGraphFocusSets(nodes, links, 'n1', '');
    expect(hoverResult.hasHover).toBe(true);
    expect(hoverResult.neighbors.has('n1')).toBe(true);
    expect(hoverResult.neighbors.has('n2')).toBe(true);
    expect(hoverResult.neighbors.has('n3')).toBe(false);
  });

  it('appendNodeVisualElements attaches circles, icons, labels and topic badges', () => {
    const svg = d3.select(document.createElementNS('http://www.w3.org/2000/svg', 'svg'));
    const nodes: GraphNode[] = [
      { id: 't1', type: 'topic', label: 'Architecture', childCount: 3 },
      { id: 'n1', type: 'note', label: 'Database Design', noteId: 'note-1' },
    ];
    const nodeSelection = svg
      .selectAll<SVGGElement, GraphNode>('g')
      .data(nodes)
      .join('g');

    const result = appendNodeVisualElements(nodeSelection);

    expect(result.circles.size()).toBe(2);
    expect(result.topicNodes.size()).toBe(1);
    expect(result.labels.size()).toBe(2);
    expect(result.labelWidths).toBeDefined();
  });
});

