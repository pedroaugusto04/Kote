import type { HTMLAttributes, PropsWithChildren, ReactNode } from 'react';

export function Badge({ value, tone }: { value: ReactNode; tone?: string }) {
  return <span className={`badge ${tone || String(value)}`}>{value}</span>;
}

export function Tags({ items }: { items: string[] }) {
  return (
    <div className="tag-row">
      {items.map((item) => (
        <span className="tag" key={item}>
          {item}
        </span>
      ))}
    </div>
  );
}

export function Panel({ children, className = '' }: PropsWithChildren<{ className?: string }>) {
  return <section className={`panel ${className}`}>{children}</section>;
}

export function PageHead({ title, subtitle, action, onBack, backLabel = 'Back' }: { title: ReactNode; subtitle: string; action?: ReactNode; onBack?: () => void; backLabel?: string }) {
  return (
    <div className="page-head">
      <div>
        {onBack ? (
          <button type="button" onClick={onBack} className="icon-button secondary page-head-back" aria-label={backLabel}>
            &larr; {backLabel}
          </button>
        ) : null}
        {typeof title === 'string' ? <h1>{title}</h1> : title}
        <p>{subtitle}</p>
      </div>
      {action}
    </div>
  );
}

export function EmptyState({ children }: PropsWithChildren) {
  return <div className="empty-state">{children}</div>;
}

export function InlineMessage({
  children,
  className = '',
  role,
  tone,
  ...props
}: PropsWithChildren<HTMLAttributes<HTMLDivElement> & { tone: 'error' | 'warning' | 'success' | 'info' }>) {
  const resolvedRole = role || (tone === 'error' ? 'alert' : 'status');
  const classes = ['inline-message', tone, className].filter(Boolean).join(' ');

  return (
    <div {...props} className={classes} role={resolvedRole}>
      {children}
    </div>
  );
}
