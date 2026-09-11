interface KnowledgeMapLoadingProps {
  label?: string;
  subtext?: string;
}

interface LoadingLink {
  id: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

interface LoadingNode {
  id: string;
  type: 'project' | 'repo' | 'folder' | 'note' | 'tag' | 'topic';
  cx: number;
  cy: number;
  r: number;
  hasInner: boolean;
}

const LOADING_LINKS: readonly LoadingLink[] = [
  { id: 'proj-repo', x1: 140, y1: 90, x2: 68, y2: 52 },
  { id: 'proj-folder', x1: 140, y1: 90, x2: 212, y2: 52 },
  { id: 'proj-note1', x1: 140, y1: 90, x2: 82, y2: 138 },
  { id: 'proj-note2', x1: 140, y1: 90, x2: 198, y2: 138 },
  { id: 'repo-tag', x1: 68, y1: 52, x2: 28, y2: 95 },
  { id: 'repo-note1', x1: 68, y1: 52, x2: 82, y2: 138 },
  { id: 'folder-topic', x1: 212, y1: 52, x2: 252, y2: 95 },
  { id: 'folder-note2', x1: 212, y1: 52, x2: 198, y2: 138 },
];

const LOADING_NODES: readonly LoadingNode[] = [
  { id: 'project', type: 'project', cx: 140, cy: 90, r: 16, hasInner: true },
  { id: 'repo', type: 'repo', cx: 68, cy: 52, r: 12, hasInner: true },
  { id: 'folder', type: 'folder', cx: 212, cy: 52, r: 11, hasInner: true },
  { id: 'note1', type: 'note', cx: 82, cy: 138, r: 9, hasInner: false },
  { id: 'note2', type: 'note', cx: 198, cy: 138, r: 9, hasInner: false },
  { id: 'tag', type: 'tag', cx: 28, cy: 95, r: 7, hasInner: false },
  { id: 'topic', type: 'topic', cx: 252, cy: 95, r: 8, hasInner: false },
];

export function KnowledgeMapLoading({
  label = 'Loading map...',
  subtext = 'Mapping project notes, tags, and relationships',
}: KnowledgeMapLoadingProps) {
  return (
    <div className="knowledge-map-loading" role="status" aria-label={label}>
      <div className="knowledge-map-loading-graphic" aria-hidden="true">
        <svg
          viewBox="0 0 280 180"
          className="knowledge-map-loading-svg"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <g className="km-loading-links">
            {LOADING_LINKS.map((link) => (
              <line
                key={`base-${link.id}`}
                x1={link.x1}
                y1={link.y1}
                x2={link.x2}
                y2={link.y2}
                className="km-loading-link-base"
              />
            ))}
            {LOADING_LINKS.map((link) => (
              <line
                key={`active-${link.id}`}
                x1={link.x1}
                y1={link.y1}
                x2={link.x2}
                y2={link.y2}
                className="km-loading-link-active"
              />
            ))}
          </g>

          <g className="km-loading-rings">
            <circle className="km-loading-ring" cx="140" cy="90" r="16" />
            <circle className="km-loading-ring delay" cx="140" cy="90" r="16" />
          </g>

          <g className="km-loading-nodes">
            {LOADING_NODES.map((node) => (
              <g key={node.id} className={`km-loading-node-group km-group-${node.type}`}>
                <circle
                  className={`km-loading-node ${node.type}`}
                  cx={node.cx}
                  cy={node.cy}
                  r={node.r}
                />
                {node.hasInner ? (
                  <circle
                    className="km-loading-node-inner"
                    cx={node.cx}
                    cy={node.cy}
                    r={Math.max(3, Math.round(node.r * 0.35))}
                  />
                ) : null}
              </g>
            ))}
          </g>
        </svg>
      </div>

      <div className="knowledge-map-loading-body">
        <div className="knowledge-map-loading-title">
          <span className="knowledge-map-loading-dot" aria-hidden="true" />
          <span>{label}</span>
        </div>
        {subtext ? <span className="knowledge-map-loading-subtext">{subtext}</span> : null}
      </div>
    </div>
  );
}
