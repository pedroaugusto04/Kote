import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';

import type { ProjectsPageContext } from '../../../app/page-context';
import { routes } from '../../../app/routing/routes';
import { formatDisplayToken } from '../../../entities/format';
import { fetchProjectFolders, fetchProjectKnowledgeMap } from '../../../shared/api/client';
import type { KnowledgeMapNodeType, ProjectKnowledgeMapResponse } from '../../../shared/api/models/project-knowledge-map';
import { projectTimelineCategoryValues, type ProjectTimelineCategory } from '../../../shared/api/models/project-timeline';
import { EmptyState, InlineMessage, PageHead } from '../../../shared/ui/primitives';
import { Select } from '../../../shared/ui/select';
import { flattenFolders } from '../projects.helpers';
import { ProjectKnowledgeForceGraph } from './ProjectKnowledgeForceGraph';
import {
  defaultVisibleKnowledgeMapNodeTypes,
  knowledgeMapLimitOptions,
  knowledgeMapNodeStyles,
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
  const params = useParams();
  const navigate = useNavigate();
  const projectSlug = params.projectSlug
    ? decodeURIComponent(params.projectSlug)
    : selectedProject || dashboard.projects[0]?.projectSlug || '';
  const project = useMemo(
    () => dashboard.projects.find((item) => item.projectSlug === projectSlug) || null,
    [dashboard.projects, projectSlug],
  );
  const [paused, setPaused] = useState(false);
  const [resetSignal, setResetSignal] = useState(0);
  const [category, setCategory] = useState<ProjectTimelineCategory>('all');
  const [folderId, setFolderId] = useState('');
  const [limit, setLimit] = useState<number>(80);
  const [visibleTypes, setVisibleTypes] = useState<Set<KnowledgeMapVisibleNodeType>>(() => new Set(defaultVisibleKnowledgeMapNodeTypes));
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
  const filteredGraph = useMemo(
    () => graph ? filterKnowledgeMapDataset(graph, visibleTypes) : null,
    [graph, visibleTypes],
  );

  useEffect(() => {
    setFolderId('');
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
        <div className="knowledge-map-loading" role="status">Loading map...</div>
      ) : graph ? (
        <>
          <KnowledgeMapControls
            category={category}
            folderId={folderId}
            folders={flatFolders}
            limit={limit}
            visibleTypes={visibleTypes}
            onCategoryChange={setCategory}
            onFolderChange={setFolderId}
            onLimitChange={setLimit}
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
              <KnowledgeMapLegend presentTypes={new Set(filteredGraph?.nodes.map((node) => node.type) || [])} />
              <ProjectKnowledgeForceGraph
                links={filteredGraph?.links || []}
                nodes={filteredGraph?.nodes || []}
                onOpenNote={openNote}
                paused={paused}
                resetSignal={resetSignal}
              />
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
  onCategoryChange: (category: ProjectTimelineCategory) => void;
  onFolderChange: (folderId: string) => void;
  onLimitChange: (limit: number) => void;
  onTypeToggle: (type: KnowledgeMapVisibleNodeType) => void;
};

function KnowledgeMapControls({
  category,
  folderId,
  folders,
  limit,
  visibleTypes,
  onCategoryChange,
  onFolderChange,
  onLimitChange,
  onTypeToggle,
}: KnowledgeMapControlsProps) {
  return (
    <div className="knowledge-map-controls" aria-label="Knowledge map filters">
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

function KnowledgeMapLegend({ presentTypes }: { presentTypes: Set<KnowledgeMapNodeType> }) {
  const types = Object.keys(knowledgeMapNodeStyles) as KnowledgeMapNodeType[];
  return (
    <div className="knowledge-map-legend" aria-label="Knowledge map legend">
      {types.filter((type) => presentTypes.has(type)).map((type) => (
        <span key={type}>
          <i style={{ background: knowledgeMapNodeStyles[type].color }} />
          {knowledgeMapNodeStyles[type].label}
        </span>
      ))}
    </div>
  );
}
