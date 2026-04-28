import type { PropsWithChildren, ReactNode } from 'react';

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

export function PageHead({ title, subtitle, action }: { title: string; subtitle: string; action?: ReactNode }) {
  return (
    <div className="page-head">
      <div>
        <h1>{title}</h1>
        <p>{subtitle}</p>
      </div>
      {action}
    </div>
  );
}

export function EmptyState({ children }: PropsWithChildren) {
  return <div className="empty-state">{children}</div>;
}
