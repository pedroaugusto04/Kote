import { useParams } from 'react-router-dom';

import type { PageContext } from '../../app/page-context';
import { Badge, EmptyState, PageHead, Panel, Tags } from '../../shared/ui/primitives';
import { ReviewRow } from '../../widgets/reviews/ReviewRow';

export function ReviewsPage({ dashboard, selectedReviewId, openReview }: PageContext) {
  const params = useParams();
  const routeReviewId = params.reviewId ? decodeURIComponent(params.reviewId) : '';
  const selected = dashboard.reviews.find((review) => review.id === (routeReviewId || selectedReviewId)) || dashboard.reviews[0];

  return (
    <>
      <PageHead title="AI Review Detail" subtitle="Resumo do push, findings por severidade, arquivos afetados e nota gerada." />
      <div className="split">
        <aside className="document-list">
          {dashboard.reviews.map((review) => (
            <ReviewRow key={review.id} review={review} dashboard={dashboard} onOpen={openReview} />
          ))}
        </aside>
        <Panel>
          {selected ? (
            <>
              <div className="meta-row">
                <Badge value={selected.status} tone={selected.status} />
                <span className="meta">
                  {selected.repo || selected.project} / {selected.branch} / {selected.date}
                </span>
              </div>
              <h1>{selected.title}</h1>
              <p>{selected.summary}</p>
              <h2>Impacto</h2>
              <p>{selected.impact || 'Sem impacto registrado.'}</p>
              <h2>Findings</h2>
              <div className="list">
                {selected.findings.map((finding, index) => (
                  <article className="finding" key={`${finding.file}-${index}`}>
                    <div className="finding-top">
                      <strong>{finding.summary}</strong>
                      <Badge value={finding.severity} tone={finding.severity} />
                    </div>
                    <div className="path">
                      {finding.file}
                      {finding.line ? `:${finding.line}` : ''}
                    </div>
                    <p>{finding.recommendation}</p>
                  </article>
                ))}
              </div>
              <h2 className="section-spaced">Arquivos afetados</h2>
              <Tags items={selected.changedFiles} />
              <h2 className="section-spaced">Nota gerada</h2>
              <div className="path">{selected.generatedNotePath}</div>
            </>
          ) : (
            <EmptyState>Nenhum review encontrado.</EmptyState>
          )}
        </Panel>
      </div>
    </>
  );
}
