import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { fetchProjectCoverage } from '../../../shared/api/client';
import { ProjectCoverageModal, CoverageHealthStatus, type ProjectCoverageData } from './ProjectCoverageModal';

interface ProjectCoverageBadgeProps {
  projectSlug: string;
  projectDisplayName?: string;
  onlyCircle?: boolean;
}

export function ProjectCoverageBadge({ projectSlug, projectDisplayName, onlyCircle = false }: ProjectCoverageBadgeProps) {
  const [showModal, setShowModal] = useState(false);

  const { data } = useQuery<ProjectCoverageData>({
    queryKey: ['projectCoverage', projectSlug],
    queryFn: () => fetchProjectCoverage(projectSlug),
    enabled: Boolean(projectSlug),
    staleTime: 60 * 1000,
  });

  if (!data) return null;

  const { coveragePercentage, healthStatus } = data;
  const isHigh = healthStatus === CoverageHealthStatus.High;
  const isModerate = healthStatus === CoverageHealthStatus.Moderate;
  const colorHex = isHigh ? '#34d399' : isModerate ? '#fbbf24' : '#f87171';

  const radius = 6.5;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (Math.min(100, Math.max(0, coveragePercentage)) / 100) * circumference;

  return (
    <>
      <button
        className={onlyCircle ? 'project-coverage-badge' : undefined}
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setShowModal(true);
        }}
        title={`Knowledge Coverage: ${coveragePercentage}% (Click for details)`}
        style={{
          background: 'rgba(255, 255, 255, 0.05)',
          border: '1px solid rgba(255, 255, 255, 0.08)',
          borderRadius: '12px',
          padding: onlyCircle ? '2px' : '2px 8px',
          cursor: 'pointer',
          display: 'inline-flex',
          alignItems: 'center',
          gap: '6px',
        }}
      >
        <svg width="18" height="18" viewBox="0 0 18 18" style={{ transform: 'rotate(-90deg)', flexShrink: 0 }}>
          <circle cx="9" cy="9" r={radius} fill="transparent" stroke="rgba(255, 255, 255, 0.12)" strokeWidth="2.5" />
          <circle cx="9" cy="9" r={radius} fill="transparent" stroke={colorHex} strokeWidth="2.5" strokeDasharray={circumference} strokeDashoffset={strokeDashoffset} strokeLinecap="round" />
        </svg>
        {!onlyCircle && (
          <span style={{ fontSize: '0.75rem', fontWeight: 600, color: colorHex }}>
            {coveragePercentage}%
          </span>
        )}
      </button>

      {showModal && (
        <ProjectCoverageModal
          projectSlug={projectSlug}
          projectDisplayName={projectDisplayName}
          onClose={() => setShowModal(false)}
        />
      )}
    </>
  );
}
