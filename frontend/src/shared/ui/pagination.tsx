import type { PaginationMeta } from '../api/models/pagination';

export function Pagination({
  pagination,
  onPageChange,
}: {
  pagination: PaginationMeta;
  onPageChange: (page: number) => void;
}) {
  const start = pagination.total === 0 ? 0 : (pagination.page - 1) * pagination.pageSize + 1;
  const end = pagination.total === 0 ? 0 : Math.min(pagination.total, pagination.page * pagination.pageSize);
  const pages = visiblePages(pagination.page, pagination.totalPages);

  return (
    <footer className="pagination-bar" aria-label="Paginação">
      <span className="badge pagination-summary">
        {start}-{end} de {pagination.total}
      </span>
      <div className="pagination-controls">
        <button
          className="icon-button pagination-button"
          type="button"
          disabled={!pagination.hasPrevious}
          onClick={() => onPageChange(pagination.page - 1)}
        >
          Anterior
        </button>
        <div className="pagination-numbers">
          {pages.map((page) => (
            <button
              key={page}
              aria-current={page === pagination.page ? 'page' : undefined}
              className={`pagination-number ${page === pagination.page ? 'active' : ''}`}
              type="button"
              onClick={() => onPageChange(page)}
            >
              {page}
            </button>
          ))}
        </div>
        <button
          className="icon-button pagination-button"
          type="button"
          disabled={!pagination.hasNext}
          onClick={() => onPageChange(pagination.page + 1)}
        >
          Próxima
        </button>
      </div>
    </footer>
  );
}

function visiblePages(current: number, totalPages: number) {
  if (totalPages <= 5) return Array.from({ length: totalPages }, (_, index) => index + 1);
  const start = Math.max(1, Math.min(current - 2, totalPages - 4));
  return Array.from({ length: 5 }, (_, index) => start + index);
}
