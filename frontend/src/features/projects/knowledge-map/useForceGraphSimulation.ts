import * as d3 from 'd3';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { KnowledgeMapLink, KnowledgeMapNode } from '../../../shared/api/models/project-knowledge-map';
import { knowledgeMapLabelLayout, knowledgeMapLinkStyles, knowledgeMapNodeStyles, knowledgeMapNodeIcons } from './knowledge-map.constants';
import {
  type GraphNode,
  type GraphLink,
  TOPIC_COLORS,
  hashNodeId,
  isReviewNote,
  nodeColor,
  graphLinkNode,
  linkDistance,
  linkStrength,
  chargeStrength,
  collisionRadius,
  shouldShowLabel,
  graphNodePosition,
  computeFitTransform,
} from './graph-physics';

export interface UseForceGraphSimulationOptions {
  nodes: KnowledgeMapNode[];
  links: KnowledgeMapLink[];
  paused: boolean;
  resetSignal: number;
  onOpenNote: (noteId: string) => void;
  searchQuery?: string;
  hiddenNodeIds?: Set<string> | null;
}

const DEFAULT_SIZE = { width: 1200, height: 760 };

export function useForceGraphSimulation({
  nodes,
  links,
  paused,
  resetSignal,
  onOpenNote,
  searchQuery = '',
  hiddenNodeIds,
}: UseForceGraphSimulationOptions) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const simulationRef = useRef<d3.Simulation<GraphNode, GraphLink> | null>(null);
  const zoomRef = useRef<d3.ZoomBehavior<SVGSVGElement, unknown> | null>(null);
  const renderFrameRef = useRef<number | null>(null);
  const startDriftRef = useRef<(() => void) | null>(null);
  const pausedRef = useRef(paused);
  const [size, setSize] = useState(DEFAULT_SIZE);
  const prevResetSignalRef = useRef(resetSignal);

  const onOpenNoteRef = useRef(onOpenNote);
  const sizeRef = useRef(size);

  useEffect(() => {
    onOpenNoteRef.current = onOpenNote;
  }, [onOpenNote]);

  useEffect(() => {
    sizeRef.current = size;
  }, [size]);

  const searchQueryRef = useRef(searchQuery);
  const updateVisualsRef = useRef<((hoveredId: string | null, searchStr: string) => void) | null>(null);
  // Refs to D3 selections so we can update visibility without rebuilding the simulation
  const nodeSelectionRef = useRef<d3.Selection<SVGGElement, GraphNode, SVGGElement, unknown> | null>(null);
  const linkSelectionRef = useRef<d3.Selection<SVGLineElement, GraphLink, SVGGElement, unknown> | null>(null);
  const hiddenNodeIdsRef = useRef<Set<string> | null | undefined>(hiddenNodeIds);

  useEffect(() => {
    searchQueryRef.current = searchQuery;
  }, [searchQuery]);

  const [expandedTopicIds, setExpandedTopicIds] = useState<Set<string>>(() => new Set());
  const expandedTopicIdsRef = useRef<Set<string>>(expandedTopicIds);
  const hiddenChildIdsRef = useRef<Set<string>>(new Set());
  const updateTopicStateRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    expandedTopicIdsRef.current = expandedTopicIds;
    if (updateTopicStateRef.current) {
      updateTopicStateRef.current();
    }
  }, [expandedTopicIds]);

  const handleToggleTopic = useCallback((topicId: string) => {
    setExpandedTopicIds((prev) => {
      const next = new Set(prev);
      if (next.has(topicId)) {
        next.delete(topicId);
      } else {
        next.add(topicId);
      }
      return next;
    });
  }, []);

  const onToggleTopicRef = useRef(handleToggleTopic);
  useEffect(() => {
    onToggleTopicRef.current = handleToggleTopic;
  }, [handleToggleTopic]);

  const graph = useMemo(
    () => ({
      nodes: nodes.map((node) => ({ ...node })),
      links: links.map((link) => ({ ...link })),
    }),
    [links, nodes],
  );

  useEffect(() => {
    pausedRef.current = paused;
  }, [paused]);

  useEffect(() => {
    const element = containerRef.current;
    if (!element) return undefined;

    const updateSize = () => {
      const rect = element.getBoundingClientRect();
      setSize({
        width: Math.max(320, Math.floor(rect.width || DEFAULT_SIZE.width)),
        height: Math.max(window.innerWidth < 720 ? 520 : 760, Math.floor(rect.height || 0)),
      });
    };
    updateSize();
    const resizeObserver = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(updateSize);
    resizeObserver?.observe(element);
    window.addEventListener('resize', updateSize);
    return () => {
      resizeObserver?.disconnect();
      window.removeEventListener('resize', updateSize);
    };
  }, []);

  const handleFitScreen = useCallback(() => {
    const svgElement = svgRef.current;
    const zoom = zoomRef.current;
    if (!svgElement || !zoom) return;

    const transform = computeFitTransform(
      graph.nodes as GraphNode[],
      new Set([...(hiddenNodeIds || []), ...hiddenChildIdsRef.current]),
      size.width,
      size.height,
    );

    d3.select(svgElement).transition().duration(750).ease(d3.easeCubicInOut).call(zoom.transform, transform);
  }, [graph.nodes, hiddenNodeIds, size.height, size.width]);

  useEffect(() => {
    const svgElement = svgRef.current;
    if (!svgElement) return undefined;

    const currentSize = sizeRef.current;

    simulationRef.current?.stop();
    if (renderFrameRef.current) window.cancelAnimationFrame(renderFrameRef.current);
    renderFrameRef.current = null;
    const svg = d3.select(svgElement);
    svg.selectAll('*').remove();
    svg.attr('viewBox', `0 0 ${currentSize.width} ${currentSize.height}`);

    const viewport = svg.append('g').attr('class', 'knowledge-map-viewport');
    const clusterLayer = viewport.append('g').attr('class', 'knowledge-map-regions').attr('aria-hidden', 'true');
    const linkLayer = viewport.append('g').attr('class', 'knowledge-map-links');
    const nodeLayer = viewport.append('g').attr('class', 'knowledge-map-nodes');
    const graphNodes = graph.nodes as GraphNode[];
    const graphLinks = graph.links as GraphLink[];
    const denseMap = graphNodes.length > 90;
    const isLargeGraph = graphNodes.length > 80;
    const isMobile = window.innerWidth < 720;
    const reducedMotion =
      typeof window.matchMedia === 'function'
        ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
        : true;
    const isDriftDisabled = reducedMotion || pausedRef.current || isLargeGraph || isMobile;
    let zoomScale = 1;
    let activeNodeId = '';

    const zoom = d3
      .zoom<SVGSVGElement, unknown>()
      .extent([
        [0, 0],
        [currentSize.width, currentSize.height],
      ])
      .scaleExtent([0.25, 3])
      .on('zoom', (event) => {
        viewport.attr('transform', event.transform.toString());
        zoomScale = event.transform.k;
        updateLabels();
      });
    zoomRef.current = zoom;
    svg.call(zoom);

    const link = linkLayer
      .selectAll<SVGLineElement, GraphLink>('line')
      .data(graphLinks)
      .join('line')
      .attr('stroke', (item) => knowledgeMapLinkStyles[item.type].stroke)
      .attr('stroke-opacity', 0.3)
      .attr('stroke-width', (item) => knowledgeMapLinkStyles[item.type].width)
      .style('transition', 'opacity 0.25s ease');

    const node = nodeLayer
      .selectAll<SVGGElement, GraphNode>('g')
      .data(graphNodes)
      .join('g')
      .attr('class', (item) => `knowledge-map-node ${item.type}${isReviewNote(item) ? ' review-note' : ''}`)
      .attr('role', (item) => ((item.type === 'note' && item.noteId) || item.type === 'topic' ? 'button' : 'img'))
      .attr('tabindex', (item) => ((item.type === 'note' && item.noteId) || item.type === 'topic' ? 0 : -1))
      .attr(
        'aria-label',
        (item) =>
          item.type === 'note' && item.noteId
            ? `Open note ${item.label}`
            : `${knowledgeMapNodeStyles[item.type].label} ${item.label}`,
      )
      .style('transition', 'opacity 0.25s ease');

    // Store selections in refs for lightweight filter updates
    nodeSelectionRef.current = node as unknown as d3.Selection<SVGGElement, GraphNode, SVGGElement, unknown>;
    linkSelectionRef.current = link as unknown as d3.Selection<SVGLineElement, GraphLink, SVGGElement, unknown>;

    node
      .on('mouseenter focus', (_event, item) => {
        activeNodeId = item.id;
        updateVisuals(item.id, searchQueryRef.current);
      })
      .on('mouseleave blur', () => {
        activeNodeId = '';
        updateVisuals(null, searchQueryRef.current);
      })
      .on('click', (_event, item) => {
        activeNodeId = item.id;
        updateVisuals(item.id, searchQueryRef.current);
        if (item.type === 'topic') {
          onToggleTopicRef.current(item.id);
        } else if (item.type === 'note' && item.noteId) {
          onOpenNoteRef.current(item.noteId);
        }
      })
      .on('keydown', (event, item) => {
        if (event.key !== 'Enter' && event.key !== ' ') return;
        if (item.type === 'topic') {
          event.preventDefault();
          onToggleTopicRef.current(item.id);
        } else if (item.type === 'note' && item.noteId) {
          event.preventDefault();
          onOpenNoteRef.current(item.noteId);
        }
      });

    // Build lookup for node ID -> parent topic cluster color for visual UI/UX identification
    const noteToTopicColorMap = new Map<string, string>();
    graphNodes.forEach((item) => {
      if (item.type === 'topic' && item.childNoteIds) {
        const color = TOPIC_COLORS[hashNodeId(item.id) % TOPIC_COLORS.length];
        item.childNoteIds.forEach((cid) => noteToTopicColorMap.set(cid, color));
      }
    });

    node.style('--node-color', (item) => noteToTopicColorMap.get(item.id) || nodeColor(item));

    const regions = clusterLayer.selectAll<SVGPathElement, GraphNode>('path')
      .data(graphNodes.filter((item) => item.type === 'topic'))
      .join('path')
      .style('--node-color', nodeColor);
    const nodesById = new Map(graphNodes.map((item) => [item.id, item]));

    const circles = node
      .append('circle')
      .attr('class', 'knowledge-map-node-body')
      .attr('r', (item) => item.size || knowledgeMapNodeStyles[item.type].radius)
      .attr('stroke-width', 1.5);

    // Append numeric count badge for topic hub nodes
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

    // Vector icons share the same geometry with the legend.
    node
      .append('path')
      .attr('class', 'knowledge-map-node-icon')
      .attr('transform', (item) => {
        const radius = item.size || knowledgeMapNodeStyles[item.type].radius;
        const size = Math.max(12, radius);
        return `translate(${-size / 2},${-size / 2}) scale(${size / 24})`;
      })
      .attr('d', (item) => knowledgeMapNodeIcons[isReviewNote(item) ? 'review-note' : item.type]);

    topicNodes.append('text')
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

    // Pre-distribute topic hub positions in a balanced radial arrangement around the canvas center
    const topicNodesList = graphNodes.filter((n) => n.type === 'topic');
    const totalTopics = topicNodesList.length;
    const centerX = currentSize.width / 2;
    const centerY = currentSize.height / 2;
    const topicRadius = Math.min(centerX, centerY) * 0.45;

    topicNodesList.forEach((topicNode, idx) => {
      const angle = (idx / Math.max(1, totalTopics)) * 2 * Math.PI - Math.PI / 2;
      topicNode.x = centerX + Math.cos(angle) * topicRadius;
      topicNode.y = centerY + Math.sin(angle) * topicRadius;
    });

    // Pre-position all other non-topic nodes in a gentle golden spiral to eliminate initial (0,0) overlap collisions
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

    const simulation = d3
      .forceSimulation<GraphNode>(graphNodes)
      .force(
        'link',
        d3
          .forceLink<GraphNode, GraphLink>(graphLinks)
          .id((item) => item.id)
          .strength(linkStrength)
          .distance(linkDistance),
      )
      .force(
        'charge',
        d3.forceManyBody().strength((item) => chargeStrength(item as GraphNode, denseMap, hiddenChildIdsRef.current)),
      )
      .force('center', d3.forceCenter(currentSize.width / 2, currentSize.height / 2))
      .force(
        'collide',
        d3.forceCollide<GraphNode>().radius((item) => collisionRadius(item as GraphNode, hiddenChildIdsRef.current)),
      )
      .on('tick', () => renderGraph(performance.now()));
    simulationRef.current = simulation;

    function refreshForces() {
      const chargeForce = simulation.force('charge') as d3.ForceManyBody<GraphNode> | null;
      if (chargeForce) {
        chargeForce.strength((item) => chargeStrength(item as GraphNode, denseMap, hiddenChildIdsRef.current));
      }
      const collideForce = simulation.force('collide') as d3.ForceCollide<GraphNode> | null;
      if (collideForce) {
        collideForce.radius((item) => collisionRadius(item as GraphNode, hiddenChildIdsRef.current));
      }
    }

    let initialized = false;
    function updateTopicState() {
      const currentExpanded = expandedTopicIdsRef.current;
      topicNodes.attr('aria-expanded', (item) => String(currentExpanded.has(item.id)));
      topicNodes.select('.knowledge-map-expand-indicator')
        .text((item) => currentExpanded.has(item.id) ? '−' : '+');
      const hiddenChildIds = new Set<string>();

      graphNodes.forEach((n) => {
        if (n.type === 'topic' && !currentExpanded.has(n.id) && n.childNoteIds) {
          n.childNoteIds.forEach((childId) => hiddenChildIds.add(childId));
        }
      });
      hiddenChildIdsRef.current = hiddenChildIds;

      node
        .style('transition', 'opacity 0.25s ease')
        .style('opacity', (d) => (hiddenChildIds.has(d.id) ? 0 : 1))
        .style('pointer-events', (d) => (hiddenChildIds.has(d.id) ? 'none' : null))
        .style('display', (d) => (hiddenChildIds.has(d.id) ? 'none' : null));

      link
        .style('transition', 'opacity 0.25s ease')
        .style('opacity', (l) => {
          const sId = typeof l.source === 'object' ? l.source.id : String(l.source);
          const tId = typeof l.target === 'object' ? l.target.id : String(l.target);
          return hiddenChildIds.has(sId) || hiddenChildIds.has(tId) ? 0 : 1;
        })
        .style('display', (l) => {
          const sId = typeof l.source === 'object' ? l.source.id : String(l.source);
          const tId = typeof l.target === 'object' ? l.target.id : String(l.target);
          return hiddenChildIds.has(sId) || hiddenChildIds.has(tId) ? 'none' : null;
        });

      refreshForces();
      simulation.alpha(0.15).restart();
      if (initialized) {
        simulation.tick(160);
        renderGraph(performance.now());
        const transform = computeFitTransform(graphNodes, new Set([...hiddenChildIds, ...(hiddenNodeIdsRef.current || [])]), sizeRef.current.width, sizeRef.current.height);
        svg.transition().duration(reducedMotion ? 0 : 350).call(zoom.transform, transform);
        updateVisuals(activeNodeId || null, searchQueryRef.current);
      }
    }

    updateTopicStateRef.current = updateTopicState;
    updateTopicState();
    initialized = true;

    const drag = d3
      .drag<SVGGElement, GraphNode>()
      .on('start', (event, item) => {
        if (!event.active) simulation.alphaTarget(0.25).restart();
        item.fx = item.x;
        item.fy = item.y;
      })
      .on('drag', (event, item) => {
        item.fx = event.x;
        item.fy = event.y;
      })
      .on('end', (event, item) => {
        if (!event.active) simulation.alphaTarget(0);
        item.fx = null;
        item.fy = null;
      });
    node.call(drag);
    updateLabels();

    // Pre-tick the simulation to get initial stable positions before fitting
    simulation.tick(denseMap ? 300 : 200);

    // Apply fit transform synchronously so the map paints centered on F5 without any secondary tick or camera jump
    const latestSize = sizeRef.current;
    const initialTransform = computeFitTransform(
      graphNodes,
      new Set([...(hiddenNodeIds || []), ...hiddenChildIdsRef.current]),
      latestSize.width,
      latestSize.height,
    );
    svg.call(zoom.transform, initialTransform);

    function updateLabels() {
      const hidden = new Set([...hiddenChildIdsRef.current, ...(hiddenNodeIdsRef.current || [])]);
      const occupied = graphNodes.filter((item) => !hidden.has(item.id)).map((item) => {
        const radius = (item.size || knowledgeMapNodeStyles[item.type].radius) + 4;
        return { x: (item.x || 0) - radius, y: (item.y || 0) - radius, width: radius * 2, height: radius * 2 };
      });
      const search = searchQueryRef.current.trim().toLowerCase();
      const priority = (item: GraphNode) => item.id === activeNodeId ? 0 : search && item.label.toLowerCase().includes(search) ? 1 : item.type === 'project' ? 2 : item.type === 'topic' ? 3 : 4;
      labels.nodes().sort((a, b) => priority(d3.select<SVGTextElement, GraphNode>(a).datum()) - priority(d3.select<SVGTextElement, GraphNode>(b).datum())).forEach((element) => {
        const label = d3.select<SVGTextElement, GraphNode>(element);
        const item = label.datum();
        const focused = item.id === activeNodeId;
        const matches = Boolean(search && item.label.toLowerCase().includes(search));
        const limit = item.type === 'topic' ? knowledgeMapLabelLayout.topicMaxLength : knowledgeMapLabelLayout.nodeMaxLength;
        const text = focused || item.label.length <= limit ? item.label : `${item.label.slice(0, limit - 1).trimEnd()}…`;
        if (element.textContent !== text) label.text(text);
        let measurement = labelWidths.get(element);
        if (measurement?.text !== text) {
          label.attr('display', null);
          measurement = { text, width: typeof element.getComputedTextLength === 'function' ? element.getComputedTextLength() : text.length * knowledgeMapLabelLayout.estimatedCharacterWidth };
          labelWidths.set(element, measurement);
        }
        const width = measurement.width;
        const box = { x: (item.x || 0) + (item.size || knowledgeMapNodeStyles[item.type].radius) + knowledgeMapLabelLayout.offset, y: (item.y || 0) - 10, width: width + 8, height: 20 };
        const overlaps = occupied.some((other) => box.x < other.x + other.width && box.x + box.width > other.x && box.y < other.y + other.height && box.y + box.height > other.y);
        const visible = !hidden.has(item.id) && (focused || matches || (shouldShowLabel(item, zoomScale, activeNodeId, isLargeGraph) && !overlaps));
        label.attr('display', visible ? null : 'none').attr('opacity', 1);
        if (visible) occupied.push(box);
      });
    }

    function updateVisuals(hoveredId: string | null, searchStr: string) {
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

      // Keep focus and search emphasis consistent with timeline visibility.
      const currentHidden = hiddenNodeIdsRef.current ?? new Set<string>();
      node.style('opacity', (d) => {
        if (currentHidden.has(d.id)) return 0;
        if (!hasSearch && !hasHover) return 1;
        let active = false;
        if (hasHover && neighbors.has(d.id)) active = true;
        if (hasSearch && matchesSearch.has(d.id)) active = true;
        return active ? 1 : 0.15;
      });

      node.classed('is-active', (d) => hoveredId === d.id || (hasSearch && matchesSearch.has(d.id)));
      circles
        .attr('stroke-width', (d) => {
          if (hoveredId === d.id || (hasSearch && matchesSearch.has(d.id))) return 2.2;
          return 1.2;
        });

      // Update link styles (respect timeline-hidden nodes)
      link
        .style('opacity', (l) => {
          const sId = typeof l.source === 'object' ? l.source.id : String(l.source);
          const tId = typeof l.target === 'object' ? l.target.id : String(l.target);

          // Always hide links connected to hidden nodes
          if (currentHidden.has(sId) || currentHidden.has(tId)) return 0;

          if (!hasSearch && !hasHover) return 1;

          let active = false;
          if (hasHover && (sId === hoveredId || tId === hoveredId)) {
            active = true;
          }
          if (hasSearch && (matchesSearch.has(sId) || matchesSearch.has(tId))) {
            return 0.4;
          }
          if (hasHover) {
            return active ? 0.95 : 0.05;
          }
          return 0.05;
        })
        .classed('is-active', (l) => {
          if (!hasHover) return false;
          const sId = typeof l.source === 'object' ? l.source.id : String(l.source);
          const tId = typeof l.target === 'object' ? l.target.id : String(l.target);
          return sId === hoveredId || tId === hoveredId;
        });

      regions.style('opacity', (item) => hasHover && item.id !== hoveredId && !item.childNoteIds?.includes(hoveredId!) ? 0.25 : 1);
      updateLabels();
    }

    updateVisualsRef.current = updateVisuals;
    if (searchQueryRef.current) {
      updateVisuals(null, searchQueryRef.current);
    }

    function renderGraph(time: number) {
      regions.attr('d', (topic) => {
        if (!expandedTopicIdsRef.current.has(topic.id) || hiddenNodeIdsRef.current?.has(topic.id)) return null;
        const members = (topic.childNoteIds || []).map((id) => nodesById.get(id))
          .filter((item): item is GraphNode => Boolean(item && !hiddenChildIdsRef.current.has(item.id) && !hiddenNodeIdsRef.current?.has(item.id)));
        if (!members.length) return null;
        const corners: [number, number][] = [topic, ...members].flatMap((item) => {
          const { x, y } = graphNodePosition(item, time, isDriftDisabled);
          const padding = (item.size || knowledgeMapNodeStyles[item.type].radius) + 18;
          return [[x - padding, y - padding], [x + padding, y - padding], [x + padding, y + padding], [x - padding, y + padding]] as [number, number][];
        });
        const hull = d3.polygonHull(corners);
        return hull ? `M${hull.map((point) => point.join(',')).join('L')}Z` : null;
      });
      link
        .attr('x1', (item) => graphNodePosition(graphLinkNode(item.source), time, isDriftDisabled).x)
        .attr('y1', (item) => graphNodePosition(graphLinkNode(item.source), time, isDriftDisabled).y)
        .attr('x2', (item) => graphNodePosition(graphLinkNode(item.target), time, isDriftDisabled).x)
        .attr('y2', (item) => graphNodePosition(graphLinkNode(item.target), time, isDriftDisabled).y);
      node.attr('transform', (item) => {
        const position = graphNodePosition(item, time, isDriftDisabled);
        return `translate(${position.x},${position.y})`;
      });
      updateLabels();
    }

    function animate(time: number) {
      renderGraph(time);
      renderFrameRef.current = isDriftDisabled ? null : window.requestAnimationFrame(animate);
    }
    function startDrift() {
      if (isDriftDisabled || renderFrameRef.current) return;
      renderFrameRef.current = window.requestAnimationFrame(animate);
    }
    startDriftRef.current = startDrift;
    startDrift();

    return () => {
      simulation.stop();
      if (renderFrameRef.current) window.cancelAnimationFrame(renderFrameRef.current);
      renderFrameRef.current = null;
      startDriftRef.current = null;
      nodeSelectionRef.current = null;
      linkSelectionRef.current = null;
    };
  }, [graph, hiddenNodeIds]);

  // Lightweight effect: apply visibility mask from hiddenNodeIds without rebuilding the simulation
  useEffect(() => {
    hiddenNodeIdsRef.current = hiddenNodeIds;
    const nodeSelection = nodeSelectionRef.current;
    const linkSelection = linkSelectionRef.current;
    if (!nodeSelection || !linkSelection) return;

    const hidden = hiddenNodeIds ?? new Set<string>();

    nodeSelection
      .style('opacity', (d) => (hidden.has(d.id) ? 0 : null))
      .style('pointer-events', (d) => (hidden.has(d.id) ? 'none' : null))
      .attr('aria-hidden', (d) => (hidden.has(d.id) ? 'true' : null));

    linkSelection.style('opacity', (l) => {
      const sId = typeof l.source === 'object' ? (l.source as GraphNode).id : String(l.source);
      const tId = typeof l.target === 'object' ? (l.target as GraphNode).id : String(l.target);
      return hidden.has(sId) || hidden.has(tId) ? 0 : null;
    });
  }, [hiddenNodeIds]);

  useEffect(() => {
    updateVisualsRef.current?.(null, searchQuery);
  }, [searchQuery]);

  useEffect(() => {
    const simulation = simulationRef.current;
    if (!simulation) return;
    if (paused) {
      if (renderFrameRef.current) window.cancelAnimationFrame(renderFrameRef.current);
      renderFrameRef.current = null;
      return;
    }
    startDriftRef.current?.();
  }, [paused]);

  useEffect(() => {
    if (resetSignal !== prevResetSignalRef.current) {
      prevResetSignalRef.current = resetSignal;
      handleFitScreen();
    }
  }, [resetSignal, handleFitScreen]);

  useEffect(() => {
    const svgElement = svgRef.current;
    if (!svgElement) return;
    const svg = d3.select(svgElement);
    svg.attr('viewBox', `0 0 ${size.width} ${size.height}`);

    if (zoomRef.current) {
      zoomRef.current.extent([
        [0, 0],
        [size.width, size.height],
      ]);
    }
  }, [size.width, size.height]);

  useEffect(() => {
    if (size.width === DEFAULT_SIZE.width && size.height === DEFAULT_SIZE.height) {
      return;
    }
    const svgElement = svgRef.current;
    const zoom = zoomRef.current;
    if (!svgElement || !zoom) return;

    const transform = computeFitTransform(
      graph.nodes as GraphNode[],
      new Set([...(hiddenNodeIds || []), ...hiddenChildIdsRef.current]),
      size.width,
      size.height,
    );

    d3.select(svgElement).transition().duration(750).ease(d3.easeCubicInOut).call(zoom.transform, transform);
  }, [size.width, size.height, graph, hiddenNodeIds]);

  const handleZoomIn = () => {
    const svgElement = svgRef.current;
    const zoom = zoomRef.current;
    if (!svgElement || !zoom) return;
    d3.select(svgElement).transition().duration(300).call(zoom.scaleBy, 1.3);
  };

  const handleZoomOut = () => {
    const svgElement = svgRef.current;
    const zoom = zoomRef.current;
    if (!svgElement || !zoom) return;
    d3.select(svgElement).transition().duration(300).call(zoom.scaleBy, 1 / 1.3);
  };

  return {
    containerRef,
    svgRef,
    handleZoomIn,
    handleZoomOut,
    handleFitScreen,
    handleToggleTopic,
    expandedTopicIds,
  };
}
