import type { PaginationMeta } from '../api/models/pagination';
import { animateScrollToTop } from './smooth-scroll';

export function Pagination({
  pagination,
  onPageChange,
  compact = false,
}: {
  pagination: PaginationMeta;
  onPageChange: (page: number) => void;
  compact?: boolean;
}) {
  if (pagination.totalPages <= 1) return null;

  const start = pagination.total === 0 ? 0 : (pagination.page - 1) * pagination.pageSize + 1;
  const end = pagination.total === 0 ? 0 : Math.min(pagination.total, pagination.page * pagination.pageSize);
  const pages = visiblePages(pagination.page, pagination.totalPages, compact ? 3 : 5);

  const handlePageChange = (newPage: number, event: React.MouseEvent) => {
    const target = event.currentTarget as HTMLElement;
    const scrollContainer = target.closest('.view, .modal-panel, .sidebar, .repository-picker');
    
    animateScrollToTop(scrollContainer || window);
    onPageChange(newPage);
  };

  return (
    <footer className={`pagination-bar ${compact ? 'pagination-bar-compact' : ''}`} aria-label="Pagination">
      <span className="badge pagination-summary">
        {start}-{end} of {pagination.total}
      </span>
      <div className="pagination-controls">
        <button
          className="icon-button pagination-button"
          type="button"
          disabled={!pagination.hasPrevious}
          onClick={(event) => handlePageChange(pagination.page - 1, event)}
          aria-label="Previous page"
        >
          {compact ? '‹' : 'Previous'}
        </button>
        <div className="pagination-numbers">
          {pages.map((page) => (
            <button
              key={page}
              aria-current={page === pagination.page ? 'page' : undefined}
              className={`pagination-number ${page === pagination.page ? 'active' : ''}`}
              type="button"
              onClick={(event) => handlePageChange(page, event)}
            >
              {page}
            </button>
          ))}
        </div>
        <button
          className="icon-button pagination-button"
          type="button"
          disabled={!pagination.hasNext}
          onClick={(event) => handlePageChange(pagination.page + 1, event)}
          aria-label="Next page"
        >
          {compact ? '›' : 'Next'}
        </button>
      </div>
    </footer>
  );
}

function visiblePages(current: number, totalPages: number, maxVisible: number) {
  if (totalPages <= maxVisible) return Array.from({ length: totalPages }, (_, index) => index + 1);
  const offset = Math.floor(maxVisible / 2);
  const start = Math.max(1, Math.min(current - offset, totalPages - (maxVisible - 1)));
  return Array.from({ length: maxVisible }, (_, index) => start + index);
}
