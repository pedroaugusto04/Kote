import type { HTMLAttributes, PropsWithChildren, ReactNode } from 'react';

export function Badge({ value, tone }: { value: ReactNode; tone?: string }) {
  const toneStr = tone || String(value);
  let toneClasses = 'bg-sky-500/10 text-sky-500 border-sky-500/20 dark:bg-sky-500/20 dark:text-sky-400';

  if (['success', 'completed', 'active', 'done'].includes(toneStr.toLowerCase())) {
    toneClasses = 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20 dark:bg-emerald-500/20 dark:text-emerald-400';
  } else if (['error', 'failed', 'danger', 'cancelled'].includes(toneStr.toLowerCase())) {
    toneClasses = 'bg-rose-500/10 text-rose-500 border-rose-500/20 dark:bg-rose-500/20 dark:text-rose-400';
  } else if (['warning', 'pending', 'hold'].includes(toneStr.toLowerCase())) {
    toneClasses = 'bg-amber-500/10 text-amber-500 border-amber-500/20 dark:bg-amber-500/20 dark:text-amber-400';
  }

  return (
    <span className={`inline-flex items-center px-2 py-0.5 text-xs font-semibold rounded-full border ${toneClasses}`}>
      {value}
    </span>
  );
}

export function Tags({ items }: { items: Array<string | { label: string; backgroundColor?: string; color?: string; style?: React.CSSProperties }> }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {items.map((item, index) => {
        if (typeof item === 'string') {
          return (
            <span 
              className="inline-flex items-center px-2 py-0.5 text-[11px] font-medium tracking-wide rounded-md border bg-panel text-text-soft border-line/60" 
              key={`${item}-${index}`}
            >
              {item}
            </span>
          );
        }
        let style = item.style;
        if (!style && item.backgroundColor) {
          style = {
            backgroundColor: item.backgroundColor,
            color: item.color || '#fff',
            borderColor: item.backgroundColor,
          };
        }
        return (
          <span 
            className="inline-flex items-center px-2 py-0.5 text-[11px] font-medium tracking-wide rounded-md border" 
            key={`${item.label}-${index}`} 
            style={style}
          >
            {item.label}
          </span>
        );
      })}
    </div>
  );
}

export function Panel({ children, className = '', ...props }: PropsWithChildren<HTMLAttributes<HTMLElement> & { className?: string }>) {
  return (
    <section 
      {...props} 
      className={`bg-panel border border-line/50 rounded-xl p-5 shadow-card dark:shadow-card-dark transition-all duration-300 ${className}`}
    >
      {children}
    </section>
  );
}

export function PageHead({ title, subtitle, action, onBack, backLabel = 'Back' }: { title: ReactNode; subtitle: string; action?: ReactNode; onBack?: () => void; backLabel?: string }) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-6 mb-6 border-b border-line/50">
      <div className="flex items-center gap-3">
        {onBack ? (
          <button 
            type="button" 
            onClick={onBack} 
            className="inline-flex items-center justify-center h-9 w-9 rounded-lg border border-line/60 bg-panel text-text hover:bg-line/40 transition-colors cursor-pointer" 
            aria-label={backLabel}
          >
            &larr;
          </button>
        ) : null}
        <div>
          {typeof title === 'string' ? (
            <h1 className="text-2xl font-bold tracking-tight text-text-strong">{title}</h1>
          ) : (
            title
          )}
          {subtitle ? <p className="text-sm text-muted mt-1">{subtitle}</p> : null}
        </div>
      </div>
      {action ? <div className="flex items-center gap-3">{action}</div> : null}
    </div>
  );
}

export function EmptyState({ children }: PropsWithChildren) {
  return (
    <div className="flex flex-col items-center justify-center p-8 text-center border border-dashed border-line/60 rounded-xl bg-panel/30 min-h-[220px]">
      {children}
    </div>
  );
}

export function InlineMessage({
  children,
  className = '',
  role,
  tone,
  ...props
}: PropsWithChildren<HTMLAttributes<HTMLDivElement> & { tone: 'error' | 'warning' | 'success' | 'info' }>) {
  const resolvedRole = role || (tone === 'error' ? 'alert' : 'status');
  
  let toneClasses = 'bg-sky-500/5 text-sky-500 border-sky-500/20 dark:bg-sky-500/10 dark:text-sky-400';
  if (tone === 'success') {
    toneClasses = 'bg-emerald-500/5 text-emerald-500 border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-400';
  } else if (tone === 'error') {
    toneClasses = 'bg-rose-500/5 text-rose-500 border-rose-500/20 dark:bg-rose-500/10 dark:text-rose-400';
  } else if (tone === 'warning') {
    toneClasses = 'bg-amber-500/5 text-amber-500 border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-400';
  }

  return (
    <div 
      {...props} 
      className={`p-3 rounded-lg border text-sm flex gap-3 items-start ${toneClasses} ${className}`} 
      role={resolvedRole}
    >
      {children}
    </div>
  );
}
