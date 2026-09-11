import type { KnowledgeMapLink, KnowledgeMapNode } from '../../../shared/api/models/project-knowledge-map';
import { useForceGraphSimulation } from './useForceGraphSimulation';

interface ProjectKnowledgeForceGraphProps {
  nodes: KnowledgeMapNode[];
  links: KnowledgeMapLink[];
  paused: boolean;
  resetSignal: number;
  onOpenNote: (noteId: string) => void;
  searchQuery?: string;
  hiddenNodeIds?: Set<string> | null;
}

export function ProjectKnowledgeForceGraph({
  nodes,
  links,
  paused,
  resetSignal,
  onOpenNote,
  searchQuery = '',
  hiddenNodeIds,
}: ProjectKnowledgeForceGraphProps) {
  const {
    containerRef,
    svgRef,
    handleZoomIn,
    handleZoomOut,
    handleFitScreen,
  } = useForceGraphSimulation({
    nodes,
    links,
    paused,
    resetSignal,
    onOpenNote,
    searchQuery,
    hiddenNodeIds,
  });

  return (
    <div className="knowledge-map-canvas" ref={containerRef}>
      <svg ref={svgRef} aria-label="Project knowledge map" role="img" />
      <div className="knowledge-map-zoom-controls">
        <button onClick={handleZoomIn} title="Zoom In" aria-label="Zoom In">
          +
        </button>
        <button onClick={handleZoomOut} title="Zoom Out" aria-label="Zoom Out">
          -
        </button>
        <button onClick={handleFitScreen} title="Fit to Screen" aria-label="Fit to Screen">
          ⊙
        </button>
      </div>
    </div>
  );
}
