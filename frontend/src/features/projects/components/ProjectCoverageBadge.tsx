import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { fetchProjectCoverage } from '../../../shared/api/client';
import { ProjectCoverageModal, type ProjectCoverageData } from './ProjectCoverageModal';

interface ProjectCoverageBadgeProps {
  projectSlug: string;
  projectDisplayName?: string;
  /** Dashboard coverage is computed in one batch; use it to avoid one request per visible project. */
  coveragePercentage?: number;
  onlyCircle?: boolean;
}

const HIGH_COVERAGE_THRESHOLD = 80;
const MODERATE_COVERAGE_THRESHOLD = 50;

export function ProjectCoverageBadge({ projectSlug, projectDisplayName, coveragePercentage: initialCoveragePercentage, onlyCircle = false }: ProjectCoverageBadgeProps) {
  const [showModal, setShowModal] = useState(false);

  const { data: fetchedCoverage } = useQuery<ProjectCoverageData>({
    queryKey: ['projectCoverage', projectSlug],
    queryFn: () => fetchProjectCoverage(projectSlug),
    enabled: Boolean(projectSlug) && initialCoveragePercentage === undefined,
    staleTime: 60 * 1000,
  });

  const coveragePercentage = initialCoveragePercentage ?? fetchedCoverage?.coveragePercentage;
  if (coveragePercentage === undefined) return null;

  const isHigh = coveragePercentage >= HIGH_COVERAGE_THRESHOLD;
  const isModerate = coveragePercentage >= MODERATE_COVERAGE_THRESHOLD && !isHigh;
  const colorHex = isHigh ? 'var(--green)' : isModerate ? 'var(--amber)' : 'var(--red)';

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
          background: 'var(--surface-2)',
          border: '1px solid var(--line)',
          borderRadius: '12px',
          padding: onlyCircle ? '2px' : '2px 8px',
          cursor: 'pointer',
          display: 'inline-flex',
          alignItems: 'center',
          gap: '6px',
        }}
      >
        <svg width="18" height="18" viewBox="0 0 18 18" style={{ transform: 'rotate(-90deg)', flexShrink: 0 }}>
          <circle cx="9" cy="9" r={radius} fill="transparent" stroke="var(--line-soft)" strokeWidth="2.5" />
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
