import type { ReactNode } from 'react';

export type FieldRenderProps = {
  id: string;
  'aria-invalid'?: true;
  'aria-describedby'?: string;
  'aria-required'?: true;
  'data-field': string;
  required?: true;
};

function fieldId(name: string) {
  return name.replace(/[^a-zA-Z0-9_-]+/g, '-');
}

type FormFieldRequirementProps =
  | {
      required?: boolean;
      optional?: never;
    }
  | {
      required?: never;
      optional?: boolean;
    };

export function FormField({
  name,
  label,
  error,
  children,
  required,
  optional,
}: {
  name: string;
  label: string;
  error?: string;
  children: (props: FieldRenderProps) => ReactNode;
} & FormFieldRequirementProps) {
  const id = fieldId(name);
  const errorId = `${id}-error`;
  const isRequired = required === true;
  const isOptional = !isRequired && optional === true;

  return (
    <div className="form-field" data-field={name}>
      <div className="form-field-label-row">
        <label className="form-field-label" htmlFor={id}>{label}</label>
        {isOptional ? <span className="form-field-meta">opcional</span> : null}
      </div>
      {children({
        id,
        'data-field': name,
        ...(isRequired ? { required: true, 'aria-required': true } : {}),
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
