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

    expect(screen.queryByLabelText('Paginação')).not.toBeInTheDocument();
  });

  it('exibe os controles quando existe mais de uma pagina', () => {
    renderWithAppProviders(
      <Pagination
        pagination={{ page: 1, pageSize: 10, total: 11, totalPages: 2, hasNext: true, hasPrevious: false }}
        onPageChange={vi.fn()}
      />,
    );

    expect(screen.getByLabelText('Paginação')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Página anterior' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Próxima página' })).toBeInTheDocument();
  });
});
