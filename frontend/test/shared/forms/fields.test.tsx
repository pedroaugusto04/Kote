import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { FormField } from '../../../src/shared/forms/fields';

afterEach(() => {
  cleanup();
});

describe('FormField', () => {
  it('shows a discreet optional marker without marking the control as required', () => {
    render(
      <FormField label="Tags" name="tags" optional>
        {(fieldProps) => <input {...fieldProps} />}
      </FormField>,
    );

    const input = screen.getByRole('textbox', { name: /tags/i });

    expect(screen.getByText('opcional')).toBeInTheDocument();
    expect(input).not.toBeRequired();
    expect(input).not.toHaveAttribute('aria-required');
  });

  it('propagates required semantics to the control without rendering a visual marker', () => {
    render(
      <FormField label="Email" name="email" required>
        {(fieldProps) => <input type="email" {...fieldProps} />}
      </FormField>,
    );

    const input = screen.getByRole('textbox', { name: 'Email' });

    expect(input).toBeRequired();
    expect(input).toHaveAttribute('aria-required', 'true');
    expect(screen.queryByText('opcional')).not.toBeInTheDocument();
  });

  it('keeps the error accessibility contract intact', () => {
    render(
      <FormField error="Informe o texto da nota." label="Texto" name="rawText" required>
        {(fieldProps) => <textarea {...fieldProps} />}
      </FormField>,
    );

    const textarea = screen.getByRole('textbox', { name: 'Texto' });
    const error = screen.getByRole('alert');

    expect(textarea).toHaveAttribute('aria-invalid', 'true');
    expect(textarea).toHaveAttribute('aria-describedby', 'rawText-error');
    expect(error).toHaveAttribute('id', 'rawText-error');
    expect(error).toHaveTextContent('Informe o texto da nota.');
  });
});
