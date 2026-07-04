import { keepPreviousData, useQuery } from '@tanstack/react-query';
import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';

import { useDebouncedValue } from '../../../shared/ui/use-debounced-value';
import type { ProjectsPageContext } from '../../../app/page-context';
import { routes } from '../../../app/routing/routes';
import { formatDisplayToken } from '../../../shared/utils/format';
import { fetchProjectFolders, fetchProjectKnowledgeMap } from '../../../shared/api/client';
import type { KnowledgeMapNode, ProjectKnowledgeMapResponse } from '../../../shared/api/models/project-knowledge-map';
import { projectTimelineCategoryValues, type ProjectTimelineCategory } from '../../../shared/api/models/project-timeline';
import { EmptyState, InlineMessage, PageHead } from '../../../shared/ui/primitives';
import { Select } from '../../../shared/ui/select';
import { SideNoteDrawer } from '../../../widgets/notes/SideNoteDrawer';
import { useMediaQuery } from '../../../shared/ui/use-media-query';
import { flattenFolders } from '../projects.helpers';
import { ProjectKnowledgeForceGraph } from './ProjectKnowledgeForceGraph';
import {
  defaultVisibleKnowledgeMapNodeTypes,
  knowledgeMapLimitOptions,
  knowledgeMapNodeStyles,
  knowledgeMapReviewNodeStyle,
  knowledgeMapVisibleNodeLabels,
  type KnowledgeMapVisibleNodeType,
  visibleKnowledgeMapNodeTypes,
} from './knowledge-map.constants';
import { filterKnowledgeMapDataset } from './knowledge-map.helpers';

type ProjectKnowledgeMapPageProps = Pick<ProjectsPageContext, 'dashboard' | 'openNote' | 'selectedProject'>;
const categoryOptions: Array<{ value: ProjectTimelineCategory; label: string }> = projectTimelineCategoryValues.map((value) => ({
  value,
  label: formatDisplayToken(value),
}));

export function ProjectKnowledgeMapPage({ dashboard, openNote, selectedProject }: ProjectKnowledgeMapPageProps) {
  const isMobile = useMediaQuery('(max-width: 768px)');
  const params = useParams();
  const navigate = useNavigate();
  const project = useMemo(() => {
    if (params.projectSlug) {
      const slug = decodeURIComponent(params.projectSlug);
      return dashboard.projects.find((item) => item.projectSlug === slug) || null;
    }

    if (selectedProject) {
      const found = dashboard.projects.find((item) => item.projectSlug === selectedProject);
      if (found) return found;
    }

    const favoriteProject = dashboard.projects.find((item) => item.favorite);
    if (favoriteProject) return favoriteProject;

    const inboxProject = dashboard.projects.find((item) => item.projectSlug === 'inbox');
    if (inboxProject) return inboxProject;

    return dashboard.projects[0] || null;
  }, [dashboard.projects, params.projectSlug, selectedProject]);

  const projectSlug = project?.projectSlug || '';
  const [paused, setPaused] = useState(false);
  const [resetSignal, setResetSignal] = useState(0);
  const [category, setCategory] = useState<ProjectTimelineCategory>('all');
  const [folderId, setFolderId] = useState('');
  const [limit, setLimit] = useState<number>(80);
  const [visibleTypes, setVisibleTypes] = useState<Set<KnowledgeMapVisibleNodeType>>(() => new Set(defaultVisibleKnowledgeMapNodeTypes));
  const [sideNoteId, setSideNoteId] = useState<string | null>(null);
  const [searchQueryInput, setSearchQueryInput] = useState('');
  const debouncedSearchQuery = useDebouncedValue(searchQueryInput, 300);

  const query = useQuery({
    queryKey: ['project-knowledge-map', projectSlug, category, folderId, limit],
    queryFn: () => fetchProjectKnowledgeMap(projectSlug, {
      category,
      folderId: folderId || undefined,
      limit,
    }),
    enabled: Boolean(projectSlug),
    staleTime: 30_000,
    placeholderData: keepPreviousData,
  });
  const foldersQuery = useQuery({
    queryKey: ['project-folders', projectSlug],
    queryFn: () => fetchProjectFolders(projectSlug),
    enabled: Boolean(projectSlug),
    staleTime: 30_000,
  });
  const graph = query.data;
  const flatFolders = useMemo(() => flattenFolders(foldersQuery.data?.folders || []), [foldersQuery.data?.folders]);

  const dateRange = useMemo(() => {
    if (!graph?.nodes) return null;
    const noteTimes = graph.nodes
      .filter((n) => n.type === 'note' && n.date)
      .map((n) => new Date(n.date!).getTime())
      .sort((a, b) => a - b);
    if (noteTimes.length < 2) return null;
    return {
      min: noteTimes[0],
      max: noteTimes[noteTimes.length - 1],
    };
  }, [graph]);

  const [maxDateFilter, setMaxDateFilter] = useState<number | null>(null);

  useEffect(() => {
    if (dateRange) {
      setMaxDateFilter(dateRange.max);
    } else {
      setMaxDateFilter(null);
    }
  }, [dateRange]);

  const filteredGraph = useMemo(
    () => graph ? filterKnowledgeMapDataset(graph, visibleTypes, maxDateFilter) : null,
    [graph, visibleTypes, maxDateFilter],
  );

  useEffect(() => {
    setFolderId('');
    setSideNoteId(null);
    setSearchQueryInput('');
    setResetSignal((current) => current + 1);
  }, [projectSlug]);

  if (!project) {
    return (
      <>
        <PageHead title="Knowledge map" subtitle="Project not found." onBack={() => navigate(routes.projects)} />
        <EmptyState>Project not found.</EmptyState>
      </>
    );
  }

  return (
    <div className="knowledge-map-page">
      <PageHead
        title={(
          <div className="page-head-title-row">
            <h1>Map</h1>
            <label className="sr-only" htmlFor="knowledge-map-project-select">Select project</label>
            <Select
              ariaLabel="Select project"
              className="page-head-select"
              id="knowledge-map-project-select"
              options={dashboard.projects.map((item) => ({
                value: item.projectSlug,
                label: item.displayName,
              }))}
              value={project.projectSlug}
              onChange={(nextProjectSlug) => {
                if (nextProjectSlug) navigate(routes.projectMap(nextProjectSlug));
              }}
            />
          </div>
        )}
        subtitle=""
        action={(
          <div className="knowledge-map-actions">
            <button className="icon-button secondary" type="button" onClick={() => setPaused((current) => !current)}>
              {paused ? 'Resume' : 'Pause'}
            </button>
            <button className="icon-button" type="button" onClick={() => setResetSignal((current) => current + 1)}>
              Reset view
            </button>
          </div>
        )}
      />

      {query.isError ? (
        <InlineMessage tone="error">Could not load the project knowledge map.</InlineMessage>
      ) : null}

      {query.isLoading ? (
        <div className="knowledge-map-loading" role="status" aria-label="Loading map...">
          <div className="skeleton-graph">
            <div className="skeleton-node node-1"></div>
            <div className="skeleton-node node-2"></div>
            <div className="skeleton-node node-3"></div>
            <div className="skeleton-node node-4"></div>
            <div className="skeleton-node node-5"></div>
            <div className="skeleton-line line-1"></div>
            <div className="skeleton-line line-2"></div>
            <div className="skeleton-line line-3"></div>
            <div className="skeleton-line line-4"></div>
          </div>
          <span>Loading map...</span>
        </div>
      ) : graph ? (
        <>
          <KnowledgeMapControls
            category={category}
            folderId={folderId}
            folders={flatFolders}
            limit={limit}
            visibleTypes={visibleTypes}
            dateRange={dateRange}
            maxDateFilter={maxDateFilter}
            searchQuery={searchQueryInput}
            onCategoryChange={setCategory}
            onFolderChange={setFolderId}
            onLimitChange={setLimit}
            onMaxDateFilterChange={setMaxDateFilter}
            onSearchQueryChange={setSearchQueryInput}
            onTypeToggle={(type) => {
              setVisibleTypes((current) => {
                const next = new Set(current);
                if (next.has(type)) next.delete(type);
                else next.add(type);
                next.add('project');
                return next;
              });
            }}
          />
          <KnowledgeMapStats stats={graph.stats} />
          {graph.stats.noteCount === 0 ? (
            <EmptyState>No notes match the current map filters.</EmptyState>
          ) : (
            <>
              <KnowledgeMapLegend presentTypes={new Set(filteredGraph?.nodes.map(knowledgeMapVisibleTypeFromNode) || [])} />
              <div className={`knowledge-map-container-layout${sideNoteId ? ' has-drawer' : ''}`}>
                <ProjectKnowledgeForceGraph
                  links={filteredGraph?.links || []}
                  nodes={filteredGraph?.nodes || []}
                  onOpenNote={(id) => {
                    if (isMobile) {
                      openNote(id);
                    } else if (sideNoteId === id) {
                      // If clicking again on the same note with preview open, open full page
                      openNote(id);
                    } else {
                      setSideNoteId(id);
                    }
                  }}
                  paused={paused}
                  resetSignal={resetSignal}
                  searchQuery={debouncedSearchQuery}
                />
                {sideNoteId && (
                  <SideNoteDrawer
                    noteId={sideNoteId}
                    dashboardProjects={dashboard.projects}
                    onClose={() => setSideNoteId(null)}
                    onOpenFullPage={openNote}
                  />
                )}
              </div>
            </>
          )}
        </>
      ) : null}
    </div>
  );
}

type KnowledgeMapControlsProps = {
  category: ProjectTimelineCategory;
  folderId: string;
  folders: ReturnType<typeof flattenFolders>;
  limit: number;
  visibleTypes: Set<KnowledgeMapVisibleNodeType>;
  dateRange: { min: number; max: number } | null;
  maxDateFilter: number | null;
  searchQuery: string;
  onCategoryChange: (category: ProjectTimelineCategory) => void;
  onFolderChange: (folderId: string) => void;
  onLimitChange: (limit: number) => void;
  onMaxDateFilterChange: (value: number) => void;
  onSearchQueryChange: (value: string) => void;
  onTypeToggle: (type: KnowledgeMapVisibleNodeType) => void;
};

function KnowledgeMapControls({
  category,
  folderId,
  folders,
  limit,
  visibleTypes,
  dateRange,
  maxDateFilter,
  searchQuery,
  onCategoryChange,
  onFolderChange,
  onLimitChange,
  onMaxDateFilterChange,
  onSearchQueryChange,
  onTypeToggle,
}: KnowledgeMapControlsProps) {
  return (
    <div className="knowledge-map-controls" aria-label="Knowledge map filters">
      <label>
        <span>Search</span>
        <input
          className="knowledge-map-search-input"
          placeholder="Search node names..."
          type="text"
          value={searchQuery}
          onChange={(event) => onSearchQueryChange(event.target.value)}
        />
      </label>
      <label>
        <span>Category</span>
        <select aria-label="Knowledge map category" value={category} onChange={(event) => onCategoryChange(event.target.value as ProjectTimelineCategory)}>
          {categoryOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
        </select>
      </label>
      <label>
        <span>Folder</span>
        <select aria-label="Knowledge map folder" value={folderId} onChange={(event) => onFolderChange(event.target.value)}>
          <option value="">All folders</option>
          {folders.map((folder) => (
            <option key={folder.id} value={folder.id}>{`${'  '.repeat(folder.depth)}${folder.displayName}`}</option>
          ))}
        </select>
      </label>
      <label>
        <span>Volume</span>
        <select aria-label="Knowledge map volume" value={limit} onChange={(event) => onLimitChange(Number(event.target.value))}>
          {knowledgeMapLimitOptions.map((option) => <option key={option} value={option}>{option}</option>)}
        </select>
      </label>
      <div className="knowledge-map-type-toggles" aria-label="Knowledge map node types">
        {visibleKnowledgeMapNodeTypes.filter((type) => type !== 'project').map((type) => (
          <label key={type}>
            <input
              checked={visibleTypes.has(type)}
              type="checkbox"
              onChange={() => onTypeToggle(type)}
            />
            <span>{knowledgeMapVisibleNodeLabels[type]}</span>
          </label>
        ))}
      </div>
      {dateRange && maxDateFilter !== null && (
        <div className="knowledge-map-timeline-slider">
          <label>
            <span>Timeline limit: {new Date(maxDateFilter).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })}</span>
            <input
              type="range"
              min={dateRange.min}
              max={dateRange.max}
              value={maxDateFilter}
              onChange={(event) => onMaxDateFilterChange(Number(event.target.value))}
            />
          </label>
        </div>
      )}
    </div>
  );
}

function KnowledgeMapStats({ stats }: { stats: ProjectKnowledgeMapResponse['stats'] }) {
  return (
    <div className="knowledge-map-stats" aria-label="Knowledge map stats">
      <span>{stats.noteCount} notes</span>
      <span>{stats.folderCount} folders</span>
      <span>{stats.repositoryCount} repositories</span>
      <span>{stats.tagCount} tags</span>
    </div>
  );
}

function KnowledgeMapLegend({ presentTypes }: { presentTypes: Set<KnowledgeMapVisibleNodeType> }) {
  const types = Object.keys(knowledgeMapVisibleNodeLabels) as KnowledgeMapVisibleNodeType[];
  return (
    <div className="knowledge-map-legend" aria-label="Knowledge map legend">
      {types.filter((type) => presentTypes.has(type)).map((type) => (
        <span key={type}>
          <i style={{ background: knowledgeMapLegendStyle(type).color }} />
          {knowledgeMapVisibleNodeLabels[type]}
        </span>
      ))}
    </div>
  );
}

function knowledgeMapVisibleTypeFromNode(node: KnowledgeMapNode): KnowledgeMapVisibleNodeType {
  return node.type === 'note' && node.isReview ? 'review-note' : node.type;
}

function knowledgeMapLegendStyle(type: KnowledgeMapVisibleNodeType) {
  return type === 'review-note' ? knowledgeMapReviewNodeStyle : knowledgeMapNodeStyles[type];
}
