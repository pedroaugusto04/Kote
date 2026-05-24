import { useTheme } from '../../app/providers/theme';

type ThemeToggleProps = {
  className?: string;
};

export function ThemeToggle({ className = 'theme-toggle' }: ThemeToggleProps) {
  const { effectiveTheme, toggleTheme } = useTheme();
  const nextModeLabel = effectiveTheme === 'dark' ? 'Enable light mode' : 'Enable dark mode';

  return (
    <button
      aria-label={nextModeLabel}
      className={className}
      onClick={toggleTheme}
      title={nextModeLabel}
      type="button"
    >
      <svg aria-hidden="true" viewBox="0 0 24 24" fill="none">
        {effectiveTheme === 'dark' ? (
          <>
            <circle cx="12" cy="12" r="4.25" stroke="currentColor" strokeWidth="1.8" />
            <path
              d="M12 2.75v2.1M12 19.15v2.1M21.25 12h-2.1M4.85 12h-2.1M18.54 5.46l-1.48 1.48M6.94 17.06l-1.48 1.48M18.54 18.54l-1.48-1.48M6.94 6.94L5.46 5.46"
              stroke="currentColor"
              strokeLinecap="round"
              strokeWidth="1.8"
            />
          </>
        ) : (
          <path
            d="M13.948 3.464a1 1 0 0 0-1.29 1.248 7.25 7.25 0 1 1-8.946 8.946 1 1 0 0 0-1.248 1.29A9.25 9.25 0 1 0 13.948 3.464Z"
            fill="currentColor"
          />
        )}
      </svg>
    </button>
  );
}
