/**
 * Truncates a string to a maximum length for logging purposes.
 * If the string is shorter than maxLength, it is returned as-is.
 * Otherwise, returns the first maxLength characters followed by '...'.
 */
export function truncateForLog(value: string, maxLength = 1_500): string {
  if (value.length <= maxLength) return value;
  return `${value.slice(0, maxLength)}...`;
}
