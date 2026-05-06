import { useQuery } from '@tanstack/react-query';
import { useParams } from 'react-router-dom';

import type { PageContext } from '../../app/page-context';
import { formatUsDate } from '../../entities/format';
import { fetchReview, fetchReviews } from '../../shared/api/client';
import { Badge, EmptyState, PageHead, Panel, Tags } from '../../shared/ui/primitives';
import { Pagination } from '../../shared/ui/pagination';
import { usePaginationState } from '../../shared/ui/use-pagination-state';
import { ReviewRow } from '../../widgets/reviews/ReviewRow';

export function ReviewsPage({ dashboard, selectedReviewId, openReview }: PageContext) {
  const params = useParams();
  const routeReviewId = params.reviewId ? decodeURIComponent(params.reviewId) : '';
  const reviewId = routeReviewId || selectedReviewId;
  const { page, setPage } = usePaginationState(reviewId);
  const reviewsQuery = useQuery({
    queryKey: ['reviews', reviewId, page],
    queryFn: () => fetchReviews({ page, selectedId: reviewId }),
    initialData: dashboard.reviews
      ? {
          ok: true as const,
          reviews: dashboard.reviews.slice(0, 10),
          pagination: {
            page: 1,
            pageSize: 10,
            total: dashboard.reviews.length,
            totalPages: Math.max(1, Math.ceil(dashboard.reviews.length / 10)),
            hasNext: dashboard.reviews.length > 10,
            hasPrevious: false,
          },
        }
      : undefined,
  });
  const selectedQuery = useQuery({
    queryKey: ['review', reviewId],
    queryFn: () => fetchReview(reviewId),
    enabled: Boolean(reviewId),
  });
  const selected = selectedQuery.data || reviewsQuery.data?.reviews[0];

  return (
    <>
      <PageHead title="AI Review Detail" subtitle="Resumo gerado por IA dos pushs realizados" />
      <div className="split">
        <aside className="document-list">
          {(reviewsQuery.data?.reviews || []).map((review) => (
            <ReviewRow key={review.id} review={review} dashboard={dashboard} onOpen={openReview} />
          ))}
          {reviewsQuery.data ? <Pagination pagination={reviewsQuery.data.pagination} onPageChange={setPage} /> : null}
        </aside>
        <Panel>
          {selected ? (
            <>
              <div className="meta-row">
                <Badge value={selected.status} tone={selected.status} />
                <span className="meta">
                  {selected.repo || selected.project} / {selected.branch} / {formatUsDate(selected.date)}
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
