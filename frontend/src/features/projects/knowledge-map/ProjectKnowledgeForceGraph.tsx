import * as d3 from 'd3';
import { useEffect, useMemo, useRef, useState } from 'react';

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
};

const DEFAULT_SIZE = { width: 1200, height: 760 };

export function ProjectKnowledgeForceGraph({
  nodes,
  links,
  paused,
  resetSignal,
  onOpenNote,
  searchQuery = '',
}: ProjectKnowledgeForceGraphProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const simulationRef = useRef<d3.Simulation<GraphNode, GraphLink> | null>(null);
  const zoomRef = useRef<d3.ZoomBehavior<SVGSVGElement, unknown> | null>(null);
  const renderFrameRef = useRef<number | null>(null);
  const startDriftRef = useRef<(() => void) | null>(null);
  const pausedRef = useRef(paused);
  const [size, setSize] = useState(DEFAULT_SIZE);

  const searchQueryRef = useRef(searchQuery);
  const updateVisualsRef = useRef<((hoveredId: string | null, searchStr: string) => void) | null>(null);

  useEffect(() => {
    searchQueryRef.current = searchQuery;
  }, [searchQuery]);

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

    simulationRef.current?.stop();
    if (renderFrameRef.current) window.cancelAnimationFrame(renderFrameRef.current);
    renderFrameRef.current = null;
    const svg = d3.select(svgElement);
    svg.selectAll('*').remove();
    svg.attr('viewBox', `0 0 ${size.width} ${size.height}`);

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
    const reducedMotion = typeof window.matchMedia === 'function'
      ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
      : true;
    let zoomScale = 1;
    let activeNodeId = '';

    const zoom = d3.zoom<SVGSVGElement, unknown>()
      .extent([[0, 0], [size.width, size.height]])
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
      .attr('stroke-width', (item) => knowledgeMapLinkStyles[item.type].width);

    const node = nodeLayer
      .selectAll<SVGGElement, GraphNode>('g')
      .data(graphNodes)
      .join('g')
      .attr('class', (item) => `knowledge-map-node ${item.type}${isReviewNote(item) ? ' review-note' : ''}`)
      .attr('role', (item) => (item.type === 'note' && item.noteId ? 'button' : 'img'))
      .attr('tabindex', (item) => (item.type === 'note' && item.noteId ? 0 : -1))
      .attr('aria-label', (item) => (item.type === 'note' && item.noteId ? `Open note ${item.label}` : `${knowledgeMapNodeStyles[item.type].label} ${item.label}`))
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
        if (item.type === 'note' && item.noteId) onOpenNote(item.noteId);
      })
      .on('keydown', (event, item) => {
        if (item.type !== 'note' || !item.noteId) return;
        if (event.key !== 'Enter' && event.key !== ' ') return;
        event.preventDefault();
        onOpenNote(item.noteId);
      });

    node
      .append('circle')
      .attr('r', (item) => item.size || knowledgeMapNodeStyles[item.type].radius)
      .attr('fill', nodeColor)
      .attr('stroke', 'rgba(255,255,255,0.74)')
      .attr('stroke-width', 1.2);

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
        return '';
      });

    const labels = node
      .append('text')
      .attr('class', 'knowledge-map-node-label')
      .attr('x', (item) => (item.size || knowledgeMapNodeStyles[item.type].radius) + 6)
      .attr('y', 4)
      .text((item) => item.label);

    node.append('title').text((item) => [item.label, item.subtitle, item.date].filter(Boolean).join('\n'));

    const simulation = d3.forceSimulation<GraphNode>(graphNodes)
      .force('link', d3.forceLink<GraphNode, GraphLink>(graphLinks).id((item) => item.id).strength((item) => item.strength || 0.2).distance(linkDistance))
      .force('charge', d3.forceManyBody().strength((item) => chargeStrength(item as GraphNode, denseMap)))
      .force('center', d3.forceCenter(size.width / 2, size.height / 2))
      .force('collide', d3.forceCollide<GraphNode>().radius(collisionRadius))
      .on('tick', () => renderGraph(performance.now()));
    simulationRef.current = simulation;

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

    function updateLabels() {
      labels
        .attr('opacity', (item) => shouldShowLabel(item, zoomScale, activeNodeId) ? 1 : 0)
        .attr('display', (item) => shouldShowLabel(item, zoomScale, activeNodeId) ? null : 'none');
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

      // Update node opacity & glow
      node.style('opacity', (d) => {
        if (!hasSearch && !hasHover) return 1;
        let active = false;
        if (hasHover && neighbors.has(d.id)) active = true;
        if (hasSearch && matchesSearch.has(d.id)) active = true;
        return active ? 1 : 0.15;
      });

      node.selectAll('circle')
        .style('filter', (d: any) => {
          if (hoveredId === d.id) return 'url(#node-glow)';
          if (hasSearch && matchesSearch.has(d.id)) return 'url(#node-glow)';
          return null;
        })
        .attr('stroke-width', (d: any) => {
          if (hoveredId === d.id || (hasSearch && matchesSearch.has(d.id))) return 2.2;
          return 1.2;
        });

      // Update link styles
      link
        .style('opacity', (l) => {
          const sId = typeof l.source === 'object' ? l.source.id : String(l.source);
          const tId = typeof l.target === 'object' ? l.target.id : String(l.target);

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
          return shouldShowLabel(d, zoomScale, hoveredId || '') ? 1 : 0;
        })
        .attr('display', (d) => {
          if (d.id === hoveredId) return null;
          if (hasSearch && matchesSearch.has(d.id)) return null;
          return shouldShowLabel(d, zoomScale, hoveredId || '') ? null : 'none';
        });
    }

    updateVisualsRef.current = updateVisuals;
    if (searchQueryRef.current) {
      updateVisuals(null, searchQueryRef.current);
    }

    function renderGraph(time: number) {
      link
        .attr('x1', (item) => graphNodePosition(graphLinkNode(item.source), time, reducedMotion || pausedRef.current).x)
        .attr('y1', (item) => graphNodePosition(graphLinkNode(item.source), time, reducedMotion || pausedRef.current).y)
        .attr('x2', (item) => graphNodePosition(graphLinkNode(item.target), time, reducedMotion || pausedRef.current).x)
        .attr('y2', (item) => graphNodePosition(graphLinkNode(item.target), time, reducedMotion || pausedRef.current).y);
      node.attr('transform', (item) => {
        const position = graphNodePosition(item, time, reducedMotion || pausedRef.current);
        return `translate(${position.x},${position.y})`;
      });
    }

    function animate(time: number) {
      renderGraph(time);
      renderFrameRef.current = reducedMotion || pausedRef.current ? null : window.requestAnimationFrame(animate);
    }
    function startDrift() {
      if (reducedMotion || pausedRef.current || renderFrameRef.current) return;
      renderFrameRef.current = window.requestAnimationFrame(animate);
    }
    startDriftRef.current = startDrift;
    startDrift();

    return () => {
      simulation.stop();
      if (renderFrameRef.current) window.cancelAnimationFrame(renderFrameRef.current);
      renderFrameRef.current = null;
      startDriftRef.current = null;
    };
  }, [graph, onOpenNote, size.height, size.width]);

  useEffect(() => {
    updateVisualsRef.current?.(null, searchQuery);
  }, [searchQuery]);

  useEffect(() => {
    const simulation = simulationRef.current;
    if (!simulation) return;
    if (paused) {
      simulation.stop();
      if (renderFrameRef.current) window.cancelAnimationFrame(renderFrameRef.current);
      renderFrameRef.current = null;
      return;
    }
    simulation.alphaTarget(0.12).restart();
    startDriftRef.current?.();
    window.setTimeout(() => simulation.alphaTarget(0), 450);
  }, [paused]);

  useEffect(() => {
    const svgElement = svgRef.current;
    const zoom = zoomRef.current;
    if (!svgElement || !zoom) return;
    d3.select(svgElement).call(zoom.transform, d3.zoomIdentity);
    if (!paused) simulationRef.current?.alpha(0.7).restart();
  }, [paused, resetSignal]);

  return (
    <div className="knowledge-map-canvas" ref={containerRef}>
      <svg ref={svgRef} aria-label="Project knowledge map" role="img" />
    </div>
  );
}

function graphLinkNode(value: string | number | GraphNode) {
  return typeof value === 'object' ? value : ({ x: 0, y: 0 } as GraphNode);
}

function linkDistance(item: GraphLink) {
  if (item.type === 'contains') return 190;
  if (item.type === 'filed-in' || item.type === 'from-repository') return 170;
  return 150;
}

function chargeStrength(item: GraphNode, denseMap: boolean) {
  const base = item.type === 'project' ? -720 : item.type === 'note' ? -500 : -520;
  return denseMap ? base * 1.28 : base;
}

function collisionRadius(item: GraphNode) {
  const radius = item.size || knowledgeMapNodeStyles[item.type].radius;
  if (isReviewNote(item)) return radius + 28;
  const noteLabelAllowance = Math.min(150, Math.max(64, item.label.length * 5.8));
  const labelAllowance = item.type === 'note' ? noteLabelAllowance : item.type === 'tag' ? 38 : 48;
  return radius + labelAllowance;
}

function shouldShowLabel(item: GraphNode, zoomScale: number, activeNodeId: string) {
  if (item.id === activeNodeId) return true;
  if (isReviewNote(item)) return zoomScale >= 1.55;
  if (item.type === 'project' || item.type === 'repository' || item.type === 'folder' || item.type === 'category' || item.type === 'tag' || item.type === 'note') return true;
  return zoomScale >= (item.type === 'note' ? 1.25 : 1.7);
}

function nodeColor(item: GraphNode) {
  return isReviewNote(item) ? knowledgeMapReviewNodeStyle.color : knowledgeMapNodeStyles[item.type].color;
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
