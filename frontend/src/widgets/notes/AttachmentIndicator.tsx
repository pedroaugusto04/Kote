export function AttachmentIndicator({ count }: { count: number }) {
  if (count <= 0) return null;

  return (
    <span className="attachment-indicator" aria-label={`${count} ${count === 1 ? 'anexo' : 'anexos'}`}>
      <PaperclipIcon />
      <span>{count}</span>
    </span>
  );
}

function PaperclipIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 16 16">
      <path
        d="M6 12.7 12.1 6.6a2.4 2.4 0 0 0-3.4-3.4L3.5 8.4a3.7 3.7 0 0 0 5.2 5.2l5.3-5.3"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.3"
      />
      <path
        d="m5.7 10.2 5-5a1.1 1.1 0 0 1 1.5 1.5L7 11.9"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.3"
      />
    </svg>
  );
}
