export function cleanVersion(version: string): string {
  return version.replace(/^[\^~]/, '');
}
