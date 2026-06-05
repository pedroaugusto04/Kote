export function getUserInitials(input: { displayName?: string | null; email?: string | null }) {
  const displayName = String(input.displayName || '').trim();
  const source = displayName || String(input.email || '').trim();
  if (!source) return 'U';

  const nameParts = source
    .replace(/@.*/, '')
    .split(/[\s._-]+/)
    .map((part) => part.trim())
    .filter(Boolean);
  const initials = nameParts.slice(0, 2).map((part) => part[0]?.toUpperCase()).join('');
  return initials || 'U';
}
