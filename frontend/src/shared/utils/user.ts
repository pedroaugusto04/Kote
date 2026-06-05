export function getUserInitials(input: { displayName?: string | null; email?: string | null }) {
  const displayName = (input.displayName || '').trim();
  const source = displayName || (input.email || '').trim();
  if (!source) return 'U';

  const nameParts = source
    .replace(/@.*/, '')
    .split(/[\s._-]+/)
    .map((part) => part.trim())
    .filter(Boolean);
  const initials = nameParts.slice(0, 2).map((part) => part[0]?.toUpperCase()).join('');
  return initials || 'U';
}
