import { createPortal } from 'react-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { fetchProjectCoverage } from '../../../shared/api/client';
import { UI_MESSAGES } from '../../../shared/constants/ui.constants';
import { BookOpenIcon, RefreshCwIcon } from '../../../shared/ui/icons';

export enum CoverageHealthStatus {
  High = 'high',
  Moderate = 'moderate',
  Low = 'low',
}

export interface ProjectCoverageData {
  projectId: string;
  projectSlug: string;
  coveragePercentage: number;
  totalFiles: number;
  coveredFiles: number;
  uncoveredFiles: number;
  healthStatus: CoverageHealthStatus;
  folderBreakdown: Array<{
    folderPath: string;
    totalFiles: number;
    coveredFiles: number;
    percentage: number;
  }>;
}

interface ProjectCoverageModalProps {
  projectSlug: string;
  projectDisplayName?: string;
  onClose: () => void;
}

export function ProjectCoverageModal({ projectSlug, projectDisplayName, onClose }: ProjectCoverageModalProps) {
  const queryClient = useQueryClient();
  const { data, isLoading, isFetching } = useQuery<ProjectCoverageData>({
    queryKey: ['projectCoverage', projectSlug],
    queryFn: () => fetchProjectCoverage(projectSlug),
    enabled: Boolean(projectSlug),
  });

  const handleForceSync = async () => {
    await queryClient.invalidateQueries({ queryKey: ['projectCoverage', projectSlug] });
    await queryClient.fetchQuery({
      queryKey: ['projectCoverage', projectSlug],
      queryFn: () => fetchProjectCoverage(projectSlug, true),
    });
  };

  if (isLoading || !data) {
    return createPortal(
      <div className="modal-backdrop" role="presentation" onClick={onClose}>
        <section className="modal-panel integration-modal" style={{ maxWidth: '480px' }} onClick={(e) => e.stopPropagation()}>
          <div className="modal-head">
            <div>
              <div className="card-kicker">Knowledge Coverage</div>
              <h2>{projectDisplayName || projectSlug}</h2>
            </div>
            <button className="modal-close" type="button" onClick={onClose}>×</button>
          </div>
          <p className="meta" style={{ padding: '16px 0' }}>Loading coverage details...</p>
        </section>
      </div>,
      document.body,
    );
  }

  const { coveragePercentage, totalFiles, coveredFiles, uncoveredFiles, healthStatus, folderBreakdown } = data;

  const isHigh = healthStatus === CoverageHealthStatus.High;
  const isModerate = healthStatus === CoverageHealthStatus.Moderate;
  const colorHex = isHigh ? '#34d399' : isModerate ? '#fbbf24' : '#f87171';
  const statusLabel = isHigh ? 'High Health' : isModerate ? 'Moderate Coverage' : 'Knowledge Gaps Detected';

  const radius = 22;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (Math.min(100, Math.max(0, coveragePercentage)) / 100) * circumference;

  return createPortal(
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <section
        aria-labelledby="coverage-modal-title"
        aria-modal="true"
        className="modal-panel integration-modal"
        style={{ maxWidth: '480px' }}
        role="dialog"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="modal-head">
          <div>
            <div className="card-kicker">Knowledge Coverage</div>
            <h2 id="coverage-modal-title">{projectDisplayName || projectSlug}</h2>
          </div>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <button
              className="filter-chip"
              type="button"
              onClick={handleForceSync}
              disabled={isFetching}
              title="Refresh file tree from GitHub"
              style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '6px 12px', fontSize: '0.8rem' }}
            >
              <RefreshCwIcon style={{ width: '14px', height: '14px', opacity: isFetching ? 0.5 : 1 }} />
              {isFetching ? 'Syncing...' : 'Sync Files'}
            </button>
            <button aria-label={UI_MESSAGES.CLOSE_DETAILS} className="modal-close" type="button" onClick={onClose}>×</button>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '16px', padding: '14px 16px', background: 'var(--panel-bg-subtle, rgba(255, 255, 255, 0.03))', borderRadius: '8px', border: '1px solid var(--border-color, rgba(255, 255, 255, 0.08))' }}>
          <div style={{ position: 'relative', width: '54px', height: '54px', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <svg width="54" height="54" viewBox="0 0 54 54" style={{ transform: 'rotate(-90deg)' }}>
              <circle cx="27" cy="27" r={radius} fill="transparent" stroke="rgba(255, 255, 255, 0.1)" strokeWidth="5" />
              <circle cx="27" cy="27" r={radius} fill="transparent" stroke={colorHex} strokeWidth="5" strokeDasharray={circumference} strokeDashoffset={strokeDashoffset} strokeLinecap="round" />
            </svg>
            <BookOpenIcon style={{ position: 'absolute', width: '18px', height: '18px', color: colorHex }} />
          </div>

          <div>
            <div style={{ fontSize: '1.6rem', fontWeight: 700, color: colorHex, lineHeight: 1 }}>
              {coveragePercentage}%
            </div>
            <span style={{ fontSize: '0.75rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px', color: colorHex }}>
              {statusLabel}
            </span>
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '16px' }}>
          <div>
            <strong style={{ color: 'var(--text-color)' }}>{coveredFiles}</strong> of {totalFiles} Files Documented
          </div>
          <div>
            <strong style={{ color: uncoveredFiles > 0 ? '#f87171' : 'var(--text-color)' }}>{uncoveredFiles}</strong> Knowledge Gaps
          </div>
        </div>

        {folderBreakdown.length > 0 && (
          <div className="integration-card-body" style={{ marginBottom: '20px' }}>
            <p className="meta" style={{ fontWeight: 600, color: 'var(--text-color)', marginBottom: '10px' }}>
              Coverage by Directory:
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {folderBreakdown.map((folder) => (
                <div key={folder.folderPath} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '0.85rem' }}>
                  <span style={{ fontFamily: 'monospace' }}>{folder.folderPath}/</span>
                  <span style={{ fontWeight: 600, color: folder.percentage >= 80 ? '#34d399' : folder.percentage >= 50 ? '#fbbf24' : '#f87171' }}>
                    {folder.percentage}% ({folder.coveredFiles}/{folder.totalFiles})
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="form-actions">
          <button className="filter-chip" type="button" onClick={onClose}>
            Close
          </button>
        </div>
      </section>
    </div>,
    document.body,
  );
}
