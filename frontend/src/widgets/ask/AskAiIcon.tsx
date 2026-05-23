type AskAiIconProps = {
  className?: string;
};

export function AskAiIcon({ className = '' }: AskAiIconProps) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      fill="none"
      viewBox="0 0 20 20"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M10 2.75v2.2M10 15.05v2.2M4.05 4.05l1.56 1.56M14.39 14.39l1.56 1.56M2.75 10h2.2M15.05 10h2.2M4.05 15.95l1.56-1.56M14.39 5.61l1.56-1.56"
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth="1.4"
      />
      <path
        d="M10 6.8l.82 1.96 2.12.18-1.61 1.39.48 2.07L10 11.3 8.19 12.4l.48-2.07-1.61-1.39 2.12-.18L10 6.8Z"
        stroke="currentColor"
        strokeLinejoin="round"
        strokeWidth="1.4"
      />
    </svg>
  );
}
