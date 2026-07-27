export function GlobalLoadingOverlay({ message = null }: { message?: string | null }) {
  return (
    <div
      aria-busy="true"
      aria-live="polite"
      className="global-loading-overlay"
      role="status"
    >
      <div aria-hidden="true" className="global-loading-spinner" />
      {message && (
        <div className="global-loading-message">{message}</div>
      )}
      <span className="sr-only">Loading {message && `- ${message}`}</span>
    </div>
  );
}
