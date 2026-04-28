import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { Badge, PageHead } from './primitives';

describe('ui primitives', () => {
  it('renders page headings and badges', () => {
    render(
      <>
        <PageHead title="Vault Home" subtitle="Resumo operacional" />
        <Badge value="active" />
      </>,
    );

    expect(screen.getByRole('heading', { name: 'Vault Home' })).toBeInTheDocument();
    expect(screen.getByText('Resumo operacional')).toBeInTheDocument();
    expect(screen.getByText('active')).toBeInTheDocument();
  });
});
