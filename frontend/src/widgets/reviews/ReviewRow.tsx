import type { Dashboard } from '../../shared/api/models/dashboard';
import type { Review } from '../../shared/api/models/review';
import { projectName } from '../../entities/format';
import { Badge } from '../../shared/ui/primitives';

export function ReviewRow({ review, dashboard, onOpen }: { review: Review; dashboard: Dashboard; onOpen: (id: string) => void }) {
  const highCount = review.findings.filter((finding) => finding.severity === 'high').length;

  return (
    <article className="list-row clickable" onClick={() => onOpen(review.id)}>
      <div>
        <div className="meta-row">
          <Badge value={highCount ? `${highCount} high` : 'sem high'} tone={highCount ? 'high' : 'low'} />
          <span className="meta">
            {projectName(dashboard.projects, review.project)} / {review.date}
          </span>
        </div>
        <h3>{review.title}</h3>
        <p>{review.summary}</p>
      </div>
      <span className="file-icon">AI</span>
    </article>
  );
}
