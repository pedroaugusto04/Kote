import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, describe, expect, it } from 'vitest';

import { Select } from '../../src/shared/ui/select';

function SelectHarness() {
  const [value, setValue] = useState('');

  return (
    <>
      <Select
        ariaLabel="Filtrar por status"
        options={[
          { value: '', label: 'Todos' },
          { value: 'pending', label: 'Pendentes' },
          { value: 'resolved', label: 'Resolvidos' },
        ]}
        value={value}
        onChange={setValue}
      />
      <span data-testid="current-value">{value || 'empty'}</span>
    </>
  );
}

describe('Select', () => {
  afterEach(() => {
    cleanup();
  });

  it('abre a lista e seleciona uma opcao por clique', () => {
    render(<SelectHarness />);

    fireEvent.click(screen.getByRole('button', { name: 'Filtrar por status' }));

    fireEvent.click(screen.getByRole('option', { name: 'Pendentes' }));

    expect(screen.queryByRole('option', { name: 'Pendentes' })).not.toBeInTheDocument();
    expect(screen.getByTestId('current-value')).toHaveTextContent('pending');
  });

  it('permite navegar com teclado e confirmar com enter', () => {
    render(<SelectHarness />);

    const trigger = screen.getByRole('button', { name: 'Filtrar por status' });
    fireEvent.keyDown(trigger, { key: 'ArrowDown' });
    fireEvent.keyDown(trigger, { key: 'ArrowDown' });
    fireEvent.keyDown(trigger, { key: 'Enter' });

    expect(screen.getByTestId('current-value')).toHaveTextContent('pending');
  });
});
