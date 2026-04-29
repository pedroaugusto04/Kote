import type { ReactNode } from 'react';

export type FieldRenderProps = {
  id: string;
  'aria-invalid'?: true;
  'aria-describedby'?: string;
  'data-field': string;
};

function fieldId(name: string) {
  return name.replace(/[^a-zA-Z0-9_-]+/g, '-');
}

export function FormField({
  name,
  label,
  error,
  children,
}: {
  name: string;
  label: string;
  error?: string;
  children: (props: FieldRenderProps) => ReactNode;
}) {
  const id = fieldId(name);
  const errorId = `${id}-error`;

  return (
    <div className="form-field" data-field={name}>
      <label htmlFor={id}>{label}</label>
      {children({
        id,
        'data-field': name,
        ...(error ? { 'aria-invalid': true, 'aria-describedby': errorId } : {}),
      })}
      {error ? (
        <p className="form-error" id={errorId} role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}

export function FormActions({
  cancelLabel = 'Cancelar',
  submitLabel,
  disabled,
  onCancel,
}: {
  cancelLabel?: string;
  submitLabel: string;
  disabled?: boolean;
  onCancel: () => void;
}) {
  return (
    <div className="form-actions">
      <button className="filter-chip" type="button" onClick={onCancel}>
        {cancelLabel}
      </button>
      <button className="icon-button" disabled={disabled} type="submit">
        {submitLabel}
      </button>
    </div>
  );
}
