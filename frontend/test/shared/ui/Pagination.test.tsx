import { screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { renderWithAppProviders } from '../../../src/app/test-utils';
import { Pagination } from '../../../src/shared/ui/pagination';

describe('Pagination', () => {
  it('oculta os controles quando existe apenas uma pagina', () => {
    renderWithAppProviders(
      <Pagination
        pagination={{ page: 1, pageSize: 10, total: 3, totalPages: 1, hasNext: false, hasPrevious: false }}
        onPageChange={vi.fn()}
      />,
    );

    expect(screen.queryByLabelText('Pagination')).not.toBeInTheDocument();
  });

  it('exibe os controles quando existe mais de uma pagina', () => {
    renderWithAppProviders(
      <Pagination
        pagination={{ page: 1, pageSize: 10, total: 6, totalPages: 2, hasNext: true, hasPrevious: false }}
        onPageChange={vi.fn()}
      />,
    );

    expect(screen.getByLabelText('Pagination')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Previous page' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Next page' })).toBeInTheDocument();
  });
});
