import * as d3 from 'd3';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import type { KnowledgeMapLink, KnowledgeMapNode } from '../../../shared/api/models/project-knowledge-map';
import { knowledgeMapLinkStyles, knowledgeMapNodeStyles, knowledgeMapReviewNodeStyle } from './knowledge-map.constants';

type GraphNode = KnowledgeMapNode & d3.SimulationNodeDatum;
type GraphLink = Omit<KnowledgeMapLink, 'source' | 'target'> & d3.SimulationLinkDatum<GraphNode>;

type ProjectKnowledgeForceGraphProps = {
  nodes: KnowledgeMapNode[];
  links: KnowledgeMapLink[];
  paused: boolean;
  resetSignal: number;
  onOpenNote: (noteId: string) => void;
  searchQuery?: string;
  hiddenNodeIds?: Set<string> | null;
};

const DEFAULT_SIZE = { width: 1200, height: 760 };

export function ProjectKnowledgeForceGraph({
  nodes,
  links,
  paused,
  resetSignal,
  onOpenNote,
  searchQuery = '',
  hiddenNodeIds,
}: ProjectKnowledgeForceGraphProps) {
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

  const graph = useMemo(() => ({
    nodes: nodes.map((node) => ({ ...node })),
    links: links.map((link) => ({ ...link })),
  }), [links, nodes]);

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

    // Add SVG definitions for shadows/glows
    const defs = svg.append('defs');
    const filter = defs.append('filter')
      .attr('id', 'node-glow')
      .attr('x', '-50%')
      .attr('y', '-50%')
      .attr('width', '200%')
      .attr('height', '200%');

    filter.append('feGaussianBlur')
      .attr('stdDeviation', '4')
      .attr('result', 'blur');

    const feMerge = filter.append('feMerge');
    feMerge.append('feMergeNode').attr('in', 'blur');
    feMerge.append('feMergeNode').attr('in', 'SourceGraphic');

    const viewport = svg.append('g').attr('class', 'knowledge-map-viewport');
    const linkLayer = viewport.append('g').attr('class', 'knowledge-map-links');
    const nodeLayer = viewport.append('g').attr('class', 'knowledge-map-nodes');
    const graphNodes = graph.nodes as GraphNode[];
    const graphLinks = graph.links as GraphLink[];
    const denseMap = graphNodes.length > 90;
    const isLargeGraph = graphNodes.length > 80;
    const isMobile = window.innerWidth < 720;
    const reducedMotion = typeof window.matchMedia === 'function'
      ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
      : true;
    const isDriftDisabled = reducedMotion || pausedRef.current || isLargeGraph;
    let zoomScale = 1;
    let activeNodeId = '';

    const zoom = d3.zoom<SVGSVGElement, unknown>()
      .extent([[0, 0], [currentSize.width, currentSize.height]])
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
      .attr('stroke-opacity', 0.55)
      .attr('stroke-width', (item) => knowledgeMapLinkStyles[item.type].width)
      .style('transition', 'opacity 0.25s ease');

    const node = nodeLayer
      .selectAll<SVGGElement, GraphNode>('g')
      .data(graphNodes)
      .join('g')
      .attr('class', (item) => `knowledge-map-node ${item.type}${isReviewNote(item) ? ' review-note' : ''}`)
      .attr('role', (item) => (item.type === 'note' && item.noteId ? 'button' : 'img'))
      .attr('tabindex', (item) => (item.type === 'note' && item.noteId ? 0 : -1))
      .attr('aria-label', (item) => (item.type === 'note' && item.noteId ? `Open note ${item.label}` : `${knowledgeMapNodeStyles[item.type].label} ${item.label}`))
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

    // Append luminous halo aura ring behind member notes for instant visual cluster identification
    node
      .filter((item) => noteToTopicColorMap.has(item.id))
      .append('circle')
      .attr('class', 'knowledge-map-cluster-halo')
      .attr('r', (item) => (item.size || knowledgeMapNodeStyles[item.type].radius) + 5)
      .attr('fill', (item) => noteToTopicColorMap.get(item.id)!)
      .attr('opacity', 0.3)
      .style('pointer-events', 'none');

    const circles = node
      .append('circle')
      .attr('r', (item) => item.size || knowledgeMapNodeStyles[item.type].radius)
      .attr('fill', nodeColor)
      .attr('stroke', (item) => {
        if (item.type === 'topic') return '#ffffff';
        if (noteToTopicColorMap.has(item.id)) return noteToTopicColorMap.get(item.id)!;
        return 'rgba(255,255,255,0.74)';
      })
      .attr('stroke-width', (item) => {
        if (item.type === 'topic') return 2.5;
        if (noteToTopicColorMap.has(item.id)) return 2.8;
        return 1.2;
      });

    // Append numeric count badge for topic hub nodes
    const topicNodes = node.filter((item) => item.type === 'topic' && Boolean(item.childCount));

    topicNodes
      .append('circle')
      .attr('cx', (item) => (item.size || knowledgeMapNodeStyles[item.type].radius) * 0.75)
      .attr('cy', (item) => -(item.size || knowledgeMapNodeStyles[item.type].radius) * 0.75)
      .attr('r', 9)
      .attr('fill', '#0f172a')
      .attr('stroke', '#ffffff')
      .attr('stroke-width', 1.5);

    topicNodes
      .append('text')
      .attr('x', (item) => (item.size || knowledgeMapNodeStyles[item.type].radius) * 0.75)
      .attr('y', (item) => -(item.size || knowledgeMapNodeStyles[item.type].radius) * 0.75 + 0.5)
      .attr('text-anchor', 'middle')
      .attr('dominant-baseline', 'central')
      .attr('fill', '#ffffff')
      .attr('font-size', '10px')
      .attr('font-weight', 'bold')
      .style('pointer-events', 'none')
      .text((item) => String(item.childCount || 0));

    // Append text icon symbol inside node circles
    node
      .append('text')
      .attr('class', 'knowledge-map-node-icon')
      .attr('text-anchor', 'middle')
      .attr('dominant-baseline', 'central')
      .attr('fill', '#ffffff')
      .attr('font-size', (item) => {
        const radius = item.size || knowledgeMapNodeStyles[item.type].radius;
        return `${radius * 0.95}px`;
      })
      .style('pointer-events', 'none')
      .text((item) => {
        if (item.type === 'project') return '★';
        if (item.type === 'repository') return '⚙';
        if (item.type === 'folder') return '📁';
        if (item.type === 'note') return '📄';
        if (item.type === 'tag') return '#';
        if (item.type === 'category') return '🗂';
        if (item.type === 'topic') return '✦';
        return '';
      });

    const labels = node
      .append('text')
      .attr('class', 'knowledge-map-node-label')
      .attr('x', (item) => (item.size || knowledgeMapNodeStyles[item.type].radius) + 6)
      .attr('y', 4)
      .text((item) => item.label);

    node.append('title').text((item) => [item.label, item.subtitle, item.date].filter(Boolean).join('\n'));

    // Pre-distribute topic hub positions in a balanced radial arrangement around the canvas center
    const topicNodesList = graphNodes.filter((n) => n.type === 'topic');
    const totalTopics = topicNodesList.length;
    const centerX = currentSize.width / 2;
    const centerY = currentSize.height / 2;
    const topicRadius = Math.min(centerX, centerY) * 0.42;

    topicNodesList.forEach((topicNode, idx) => {
      const angle = (idx / Math.max(1, totalTopics)) * 2 * Math.PI - Math.PI / 2;
      topicNode.x = centerX + Math.cos(angle) * topicRadius;
      topicNode.y = centerY + Math.sin(angle) * topicRadius;
    });

    // Pre-position all other non-topic nodes in a gentle golden spiral to eliminate initial (0,0) overlap collisions
    const otherNodes = graphNodes.filter((n) => n.type !== 'topic' && n.type !== 'project');
    const goldenAngle = 2.39996;
    otherNodes.forEach((node, i) => {
      if (node.x === undefined || node.x === 0 || isNaN(node.x)) {
        const r = Math.sqrt(i + 1) * 20 + 45;
        const angle = i * goldenAngle;
        node.x = centerX + Math.cos(angle) * r;
        node.y = centerY + Math.sin(angle) * r;
      }
    });

    const simulation = d3.forceSimulation<GraphNode>(graphNodes)
      .force('link', d3.forceLink<GraphNode, GraphLink>(graphLinks).id((item) => item.id).strength(linkStrength).distance(linkDistance))
      .force('charge', d3.forceManyBody().strength((item) => chargeStrength(item as GraphNode, denseMap, hiddenChildIdsRef.current)))
      .force('center', d3.forceCenter(currentSize.width / 2, currentSize.height / 2))
      .force('collide', d3.forceCollide<GraphNode>().radius((item) => collisionRadius(item as GraphNode, hiddenChildIdsRef.current)))
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

    function updateTopicState() {
      const currentExpanded = expandedTopicIdsRef.current;
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
          return (hiddenChildIds.has(sId) || hiddenChildIds.has(tId)) ? 0 : 1;
        })
        .style('display', (l) => {
          const sId = typeof l.source === 'object' ? l.source.id : String(l.source);
          const tId = typeof l.target === 'object' ? l.target.id : String(l.target);
          return (hiddenChildIds.has(sId) || hiddenChildIds.has(tId)) ? 'none' : null;
        });

      refreshForces();
      simulation.alpha(0.15).restart();
    }

    updateTopicStateRef.current = updateTopicState;
    updateTopicState();

    const drag = d3.drag<SVGGElement, GraphNode>()
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
      hiddenNodeIds,
      latestSize.width,
      latestSize.height
    );
    svg.call(zoom.transform, initialTransform);

    function updateLabels() {
      labels
        .attr('opacity', (item) => shouldShowLabel(item, zoomScale, activeNodeId, isLargeGraph) ? 1 : 0)
        .attr('display', (item) => shouldShowLabel(item, zoomScale, activeNodeId, isLargeGraph) ? null : 'none');
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

      // Update node opacity & glow (respect timeline-hidden nodes)
      const currentHidden = hiddenNodeIdsRef.current ?? new Set<string>();
      node.style('opacity', (d) => {
        if (currentHidden.has(d.id)) return 0;
        if (!hasSearch && !hasHover) return 1;
        let active = false;
        if (hasHover && neighbors.has(d.id)) active = true;
        if (hasSearch && matchesSearch.has(d.id)) active = true;
        return active ? 1 : 0.15;
      });

      circles
        .style('filter', (d) => {
          if (hoveredId === d.id) return 'url(#node-glow)';
          if (hasSearch && matchesSearch.has(d.id)) return 'url(#node-glow)';
          return null;
        })
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

          if (!hasSearch && !hasHover) return 0.55;

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
        .classed('flowing-link', (l) => {
          if (!hasHover) return false;
          const sId = typeof l.source === 'object' ? l.source.id : String(l.source);
          const tId = typeof l.target === 'object' ? l.target.id : String(l.target);
          return sId === hoveredId || tId === hoveredId;
        });

      // Update labels
      labels
        .attr('opacity', (d) => {
          if (d.id === hoveredId) return 1;
          if (hasSearch && matchesSearch.has(d.id)) return 1;
          return shouldShowLabel(d, zoomScale, hoveredId || '', isLargeGraph) ? 1 : 0;
        })
        .attr('display', (d) => {
          if (d.id === hoveredId) return null;
          if (hasSearch && matchesSearch.has(d.id)) return null;
          return shouldShowLabel(d, zoomScale, hoveredId || '', isLargeGraph) ? null : 'none';
        });
    }

    updateVisualsRef.current = updateVisuals;
    if (searchQueryRef.current) {
      updateVisuals(null, searchQueryRef.current);
    }

    function renderGraph(time: number) {
      link
        .attr('x1', (item) => graphNodePosition(graphLinkNode(item.source), time, isDriftDisabled).x)
        .attr('y1', (item) => graphNodePosition(graphLinkNode(item.source), time, isDriftDisabled).y)
        .attr('x2', (item) => graphNodePosition(graphLinkNode(item.target), time, isDriftDisabled).x)
        .attr('y2', (item) => graphNodePosition(graphLinkNode(item.target), time, isDriftDisabled).y);
      node.attr('transform', (item) => {
        const position = graphNodePosition(item, time, isDriftDisabled);
        return `translate(${position.x},${position.y})`;
      });
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
  }, [graph]);

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
      // Stop only the visual drift loop — don't kill the simulation internals
      if (renderFrameRef.current) window.cancelAnimationFrame(renderFrameRef.current);
      renderFrameRef.current = null;
      return;
    }
    // Resume only the drift animation — don't reheat the physics simulation
    startDriftRef.current?.();
  }, [paused]);

  useEffect(() => {
    if (resetSignal !== prevResetSignalRef.current) {
      prevResetSignalRef.current = resetSignal;
      handleFitScreen();
    }
  }, [resetSignal]);

  // Handle container resizing without resetting zoom or clearing the SVG elements
  useEffect(() => {
    const svgElement = svgRef.current;
    if (!svgElement) return;
    const svg = d3.select(svgElement);
    svg.attr('viewBox', `0 0 ${size.width} ${size.height}`);

    if (zoomRef.current) {
      zoomRef.current.extent([[0, 0], [size.width, size.height]]);
    }

    const simulation = simulationRef.current;
    const isMobile = typeof window !== 'undefined' && window.innerWidth < 720;
    if (simulation && !isMobile) {
      simulation.force('center', d3.forceCenter(size.width / 2, size.height / 2));
      // Re-heat simulation slightly so nodes adjust to the new center
      simulation.alpha(0.1).restart();
    }
  }, [size.width, size.height]);

  // Re-fit to screen after initial size is set
  useEffect(() => {
    if (size.width === DEFAULT_SIZE.width && size.height === DEFAULT_SIZE.height) {
      return;
    }
    const svgElement = svgRef.current;
    const zoom = zoomRef.current;
    if (!svgElement || !zoom) return;

    const transform = computeFitTransform(
      graph.nodes as GraphNode[],
      hiddenNodeIds,
      size.width,
      size.height
    );

    d3.select(svgElement).transition().duration(750).ease(d3.easeCubicInOut).call(zoom.transform, transform);
  }, [size.width, size.height, graph]);

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

  const handleFitScreen = () => {
    const svgElement = svgRef.current;
    const zoom = zoomRef.current;
    if (!svgElement || !zoom) return;

    const transform = computeFitTransform(
      graph.nodes as GraphNode[],
      hiddenNodeIds,
      size.width,
      size.height
    );

    d3.select(svgElement).transition().duration(750).ease(d3.easeCubicInOut).call(zoom.transform, transform);
  };

  return (
    <div className="knowledge-map-canvas" ref={containerRef}>
      <svg ref={svgRef} aria-label="Project knowledge map" role="img" />
      <div className="knowledge-map-zoom-controls">
        <button onClick={handleZoomIn} title="Zoom In" aria-label="Zoom In">+</button>
        <button onClick={handleZoomOut} title="Zoom Out" aria-label="Zoom Out">-</button>
        <button onClick={handleFitScreen} title="Fit to Screen" aria-label="Fit to Screen">⊙</button>
      </div>
    </div>
  );
}

function graphLinkNode(value: string | number | GraphNode) {
  return typeof value === 'object' ? value : ({ x: 0, y: 0 } as GraphNode);
}

function linkDistance(item: GraphLink) {
  const sourceId = typeof item.source === 'object' ? item.source.id : String(item.source);
  const targetId = typeof item.target === 'object' ? item.target.id : String(item.target);
  const sourceIsTopic = sourceId.startsWith('topic:');
  const targetIsTopic = targetId.startsWith('topic:');

  // Intra-cluster link (between topic hub and member note)
  if ((sourceIsTopic && !targetIsTopic) || (targetIsTopic && !sourceIsTopic)) {
    const nonTopicId = sourceIsTopic ? targetId : sourceId;
    if (!nonTopicId.startsWith('project:') && !nonTopicId.startsWith('folder:')) {
      return 45;
    }
  }

  if (sourceIsTopic || targetIsTopic) return 130;
  if (item.type === 'contains') return 110;
  if (item.type === 'filed-in' || item.type === 'from-repository') return 100;
  return 90;
}

function linkStrength(item: GraphLink) {
  if (item.strength !== undefined) return item.strength;
  const sourceId = typeof item.source === 'object' ? item.source.id : String(item.source);
  const targetId = typeof item.target === 'object' ? item.target.id : String(item.target);
  if (sourceId.startsWith('topic:') || targetId.startsWith('topic:')) return 0.85;
  if (item.type === 'contains') return 0.75;
  if (item.type === 'filed-in') return 0.6;
  if (item.type === 'from-repository') return 0.45;
  return 0.15;
}

function chargeStrength(item: GraphNode, denseMap: boolean, hiddenChildIds?: Set<string> | null) {
  if (hiddenChildIds?.has(item.id)) return 0;
  const base = item.type === 'project' ? -350 : item.type === 'topic' ? -280 : item.type === 'note' ? -120 : -150;
  return denseMap ? base * 1.3 : base;
}

function collisionRadius(item: GraphNode, hiddenChildIds?: Set<string> | null) {
  if (hiddenChildIds?.has(item.id)) return 0;
  const radius = item.size || knowledgeMapNodeStyles[item.type].radius;
  if (item.type === 'topic') return radius + 24;
  if (isReviewNote(item)) return radius + 14;
  const labelAllowance = item.type === 'note' ? 24 : item.type === 'tag' ? 20 : 28;
  return radius + labelAllowance;
}

function shouldShowLabel(item: GraphNode, zoomScale: number, activeNodeId: string, isLargeGraph: boolean) {
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

const TOPIC_COLORS = ['#a855f7', '#06b6d4', '#ec4899', '#f59e0b', '#10b981', '#6366f1', '#3b82f6', '#14b8a6'];

function nodeColor(item: GraphNode) {
  if (isReviewNote(item)) return knowledgeMapReviewNodeStyle.color;
  if (item.type === 'topic') {
    const idx = hashNodeId(item.id) % TOPIC_COLORS.length;
    return TOPIC_COLORS[idx];
  }
  return knowledgeMapNodeStyles[item.type].color;
}

function isReviewNote(item: GraphNode) {
  return item.type === 'note' && item.isReview;
}

function graphNodePosition(item: GraphNode, time: number, staticPosition: boolean) {
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

function hashNodeId(id: string) {
  let hash = 0;
  for (let index = 0; index < id.length; index += 1) {
    hash = (hash * 31 + id.charCodeAt(index)) >>> 0;
  }
  return hash;
}

function computeFitTransform(
  nodes: GraphNode[],
  hiddenNodeIds: Set<string> | null | undefined,
  width: number,
  height: number
): d3.ZoomTransform {
  if (nodes.length === 0) {
    return d3.zoomIdentity;
  }

  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
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
    1.5
  );
  const finalScale = Math.max(0.25, scale);

  return d3.zoomIdentity
    .translate(width / 2, height / 2)
    .scale(finalScale)
    .translate(-centerX, -centerY);
}
