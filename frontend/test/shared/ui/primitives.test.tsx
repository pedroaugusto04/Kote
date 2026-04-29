import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { Badge, InlineMessage, PageHead } from '../../../src/shared/ui/primitives';

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

  it('renders inline messages with semantic roles', () => {
    render(
      <>
        <InlineMessage tone="error">Falha ao carregar.</InlineMessage>
        <InlineMessage tone="success">Workspace criado.</InlineMessage>
      </>,
    );

    expect(screen.getByRole('alert')).toHaveTextContent('Falha ao carregar.');
    expect(screen.getByRole('status')).toHaveTextContent('Workspace criado.');
  });
});
