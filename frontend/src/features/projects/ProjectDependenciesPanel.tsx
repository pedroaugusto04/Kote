import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

import { fetchProjectDependencies } from '../../shared/api/projects';
import { checkProjectDependencies, checkDependency, toggleDependency } from '../../shared/api/integrations';
import { EmptyState, InlineMessage } from '../../shared/ui/primitives';
import { formatDateIso } from '../../shared/utils/format';
import { notifySuccess, notifyError } from '../../shared/ui/notifications';
import { useGlobalLoading } from '../../app/global-loading';
import { ConfirmationModal } from '../../shared/ui/confirmation-modal';

export function ProjectDependenciesPanel({ projectSlug, projectId }: { projectSlug: string; projectId: string }) {
  const queryClient = useQueryClient();
  const globalLoading = useGlobalLoading();
  const [showConfirmModal, setShowConfirmModal] = useState(false);

  const dependenciesQuery = useQuery({
    queryKey: ['project-dependencies', projectSlug],
    queryFn: () => fetchProjectDependencies(projectSlug),
    enabled: Boolean(projectSlug),
  });

  const workspaceSlug = dependenciesQuery.data?.workspaceSlug || projectSlug;

  const checkMutation = useMutation({
    mutationFn: () => globalLoading.trackPromise(checkProjectDependencies(projectId, projectSlug)),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['project-dependencies', projectSlug] });
      queryClient.invalidateQueries({ queryKey: ['project-timeline', projectSlug] });
      notifySuccess(`Dependency check started for ${result.data.queued} packages. Processing in background - results will appear shortly.`);
      setShowConfirmModal(false);
    },
    onError: (error) => {
      notifyError('Failed to start dependency check. Please try again.');
      console.error('Dependency check error:', error);
    },
  });

  const checkDependencyMutation = useMutation({
    mutationFn: (dependencyId: string) => globalLoading.trackPromise(checkDependency(dependencyId, projectId, projectSlug)),
    onSuccess: (result, dependencyId) => {
      queryClient.invalidateQueries({ queryKey: ['project-dependencies', projectSlug] });
      queryClient.invalidateQueries({ queryKey: ['project-timeline', projectSlug] });
      notifySuccess(`Check started for dependency. Processing in background.`);
    },
    onError: (error) => {
      notifyError('Failed to start dependency check. Please try again.');
      console.error('Dependency check error:', error);
    },
  });

  const toggleDependencyMutation = useMutation({
    mutationFn: ({ dependencyId, enabled }: { dependencyId: string; enabled: boolean }) => 
      globalLoading.trackPromise(toggleDependency(dependencyId, workspaceSlug, enabled)),
    onSuccess: (result, variables) => {
      queryClient.invalidateQueries({ queryKey: ['project-dependencies', projectSlug] });
      notifySuccess(`Dependency ${variables.enabled ? 'enabled' : 'disabled'}.`);
    },
    onError: (error) => {
      notifyError('Failed to toggle dependency. Please try again.');
      console.error('Toggle dependency error:', error);
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
      <style>{`
        .urgency-badge {
          display: inline-block;
          padding: 3px 10px;
          border-radius: 6px;
          font-size: 11px;
          font-weight: 500;
          letter-spacing: 0.02em;
          text-transform: uppercase;
        }
        .urgency-critical {
          background: var(--surface-danger);
          color: var(--danger-text);
          border: 1px solid var(--danger-border);
        }
        .urgency-recommended {
          background: var(--surface-warning);
          color: var(--warning-text);
          border: 1px solid var(--warning-border);
        }
        .urgency-optional {
          background: var(--surface-info);
          color: var(--info-text);
          border: 1px solid var(--info-border);
        }
      `}</style>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '16px' }}>
        <button
          className="icon-button"
          type="button"
          onClick={() => setShowConfirmModal(true)}
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
                  <th scope="col">Urgency</th>
                  <th scope="col">Actions</th>
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
                    <td>
                      {dependency.lastUrgency ? (
                        <span className={`urgency-badge urgency-${dependency.lastUrgency}`}>
                          {dependency.lastUrgency}
                        </span>
                      ) : (
                        <span style={{ color: '#9ca3af', fontSize: '12px' }}>—</span>
                      )}
                    </td>
                    <td>
                      <button
                        className="icon-button"
                        type="button"
                        onClick={() => toggleDependencyMutation.mutate({ dependencyId: dependency.id, enabled: !dependency.enabled })}
                        disabled={toggleDependencyMutation.isPending}
                        style={{
                          padding: '4px 8px',
                          fontSize: '12px',
                          backgroundColor: dependency.enabled ? 'var(--surface-danger)' : 'var(--surface-hover)',
                          color: dependency.enabled ? 'var(--danger-text)' : 'var(--text)',
                          border: dependency.enabled ? '1px solid var(--danger-border)' : '1px solid var(--border-subtle)',
                        }}
                        title={dependency.enabled ? 'Disable monitoring' : 'Enable monitoring'}
                      >
                        {dependency.enabled ? 'Disable' : 'Enable'}
                      </button>
                      <button
                        className="icon-button"
                        type="button"
                        onClick={() => checkDependencyMutation.mutate(dependency.id)}
                        disabled={checkDependencyMutation.isPending}
                        style={{ padding: '4px 8px', fontSize: '12px', marginLeft: '4px' }}
                      >
                        {checkDependencyMutation.isPending ? 'Checking...' : 'Check'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ))}
      {showConfirmModal && (
        <ConfirmationModal
          title="Check All Dependencies"
          description="This will check for updates on all monitored dependencies. This may trigger email notifications for critical and recommended updates. Are you sure you want to continue?"
          cancelLabel="Cancel"
          confirmLabel="Check All"
          onCancel={() => setShowConfirmModal(false)}
          onConfirm={() => checkMutation.mutate()}
          busy={checkMutation.isPending}
          tone="default"
        />
      )}
    </div>
  );
}
