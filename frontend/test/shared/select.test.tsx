import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { Select } from '../../src/shared/ui/select';

function SelectHarness() {
  const [value, setValue] = useState('');

  return (
    <>
      <Select
        ariaLabel="Filtrar por status"
        options={[
          { value: '', label: 'Todos' },
          { value: 'pending', label: 'Pending' },
          { value: 'resolved', label: 'Resolved' },
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

    fireEvent.click(screen.getByRole('option', { name: 'Pending' }));

    expect(screen.queryByRole('option', { name: 'Pending' })).not.toBeInTheDocument();
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

  it('aplica classe open no container raiz quando aberto', () => {
    const { container } = render(<SelectHarness />);
    const root = container.querySelector('.kb-select');
    expect(root).not.toHaveClass('open');

    fireEvent.click(screen.getByRole('button', { name: 'Filtrar por status' }));
    expect(root).toHaveClass('open');

    fireEvent.click(screen.getByRole('option', { name: 'Pending' }));
    expect(root).not.toHaveClass('open');
  });

  it('abre para cima quando o container nao tem espaco suficiente abaixo', () => {
    const clippingRect = {
      top: 90,
      bottom: 738,
      left: 450,
      right: 1170,
      width: 720,
      height: 648,
      x: 450,
      y: 90,
      toJSON: () => ({}),
    } as DOMRect;
    const selectRect = {
      top: 466,
      bottom: 510,
      left: 470,
      right: 800,
      width: 330,
      height: 44,
      x: 470,
      y: 466,
      toJSON: () => ({}),
    } as DOMRect;
    const popoverRect = {
      top: 516,
      bottom: 746,
      left: 470,
      right: 800,
      width: 330,
      height: 230,
      x: 470,
      y: 516,
      toJSON: () => ({}),
    } as DOMRect;

    const { container } = render(
      <div data-testid="scroll-container" style={{ overflowY: 'auto' }}>
        <SelectHarness />
      </div>,
    );
    const scrollContainer = screen.getByTestId('scroll-container');
    const rectSpy = vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
      if (this === scrollContainer) return clippingRect;
      if (this.classList.contains('kb-select')) return selectRect;
      if (this.classList.contains('kb-select-popover')) return popoverRect;
      return {
        top: 0,
        bottom: 0,
        left: 0,
        right: 0,
        width: 0,
        height: 0,
        x: 0,
        y: 0,
        toJSON: () => ({}),
      } as DOMRect;
    });

    fireEvent.click(screen.getByRole('button', { name: 'Filtrar por status' }));

    expect(container.querySelector('.kb-select-popover')).toHaveClass('open-up');
    rectSpy.mockRestore();
  });
});
