import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

import { fetchProjectDependencies } from '../../shared/api/projects';
import { checkProjectDependencies } from '../../shared/api/integrations';
import { EmptyState, InlineMessage } from '../../shared/ui/primitives';
import { formatDateIso } from '../../shared/utils/format';
import { notifySuccess, notifyError } from '../../shared/ui/notifications';
import { useGlobalLoading } from '../../app/global-loading';

export function ProjectDependenciesPanel({ projectSlug, projectId }: { projectSlug: string; projectId: string }) {
  const queryClient = useQueryClient();
  const globalLoading = useGlobalLoading();
  const dependenciesQuery = useQuery({
    queryKey: ['project-dependencies', projectSlug],
    queryFn: () => fetchProjectDependencies(projectSlug),
    enabled: Boolean(projectSlug),
  });

  const checkMutation = useMutation({
    mutationFn: () => globalLoading.trackPromise(checkProjectDependencies(projectId, projectSlug)),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['project-dependencies', projectSlug] });
      queryClient.invalidateQueries({ queryKey: ['project-timeline', projectSlug] });
      notifySuccess(`Dependency check started for ${result.data.queued} packages. Processing in background - results will appear shortly.`);
    },
    onError: (error) => {
      notifyError('Failed to start dependency check. Please try again.');
      console.error('Dependency check error:', error);
    },
  });

  if (dependenciesQuery.isLoading) {
    return <EmptyState>Loading dependencies...</EmptyState>;
  }

  if (dependenciesQuery.isError) {
    return <InlineMessage tone="error">Failed to load dependencies</InlineMessage>;
  }

  const groups = dependenciesQuery.data?.groups || [];
  if (groups.length === 0) {
    return (
      <EmptyState>
        No monitored dependencies yet. Select repositories in Integrations → Dependency Watcher → Monitored Repositories.
      </EmptyState>
    );
  }

  return (
    <div className="project-dependencies-panel">
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '16px' }}>
        <button
          className="icon-button"
          type="button"
          onClick={() => checkMutation.mutate()}
          disabled={checkMutation.isPending}
        >
          {checkMutation.isPending ? 'Checking...' : 'Check for Updates'}
        </button>
      </div>
      {groups.map((group) => (
        <section className="dependency-group" key={group.repositoryId}>
          <div className="dependency-group-head">
            <strong>{group.repositoryFullName}</strong>
            <span className="meta">{group.dependencies.length} packages</span>
          </div>
          <div className="dependency-table-wrap">
            <table className="dependency-table">
              <thead>
                <tr>
                  <th scope="col">Package</th>
                  <th scope="col">Ecosystem</th>
                  <th scope="col">Current</th>
                  <th scope="col">Latest seen</th>
                  <th scope="col">Last check</th>
                </tr>
              </thead>
              <tbody>
                {group.dependencies.map((dependency) => (
                  <tr key={dependency.id}>
                    <td>{dependency.packageName}</td>
                    <td>{dependency.ecosystem}</td>
                    <td>{dependency.currentVersion}</td>
                    <td>{dependency.latestSeenVersion || '—'}</td>
                    <td>{formatDateIso(dependency.lastCheckedAt || undefined) || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ))}
    </div>
  );
}
