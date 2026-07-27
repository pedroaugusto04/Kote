export function backfillDeclinedStorageKey(workspaceSlug: string) {
  return `kb-github-backfill-declined-${workspaceSlug}`;
}

export function backfillJobStorageKey(workspaceSlug: string) {
  return `kb-github-backfill-job-${workspaceSlug}`;
}

export function isBackfillDeclined(workspaceSlug: string): boolean {
  try {
    return Boolean(localStorage.getItem(backfillDeclinedStorageKey(workspaceSlug)));
  } catch {
    return false;
  }
}

export function readBackfillJobId(workspaceSlug: string): string | null {
  try {
    return localStorage.getItem(backfillJobStorageKey(workspaceSlug));
  } catch {
    return null;
  }
}

export function markBackfillDeclined(workspaceSlug: string) {
  try {
    localStorage.setItem(backfillDeclinedStorageKey(workspaceSlug), new Date().toISOString());
  } catch {
    // ignore
  }
}

export function storeBackfillJob(workspaceSlug: string, jobId: string) {
  try {
    localStorage.setItem(backfillJobStorageKey(workspaceSlug), jobId);
  } catch {
    // ignore
  }
}
