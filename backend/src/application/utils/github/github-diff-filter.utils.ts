export const IGNORED_DIFF_EXTENSIONS = [
  '.map', '.png', '.jpg', '.jpeg', '.gif', '.svg', '.ico', '.pdf', '.zip', '.gz', '.tar', '.mp4',
];

export const IGNORED_DIFF_FILENAMES = [
  'package-lock.json', 'pnpm-lock.yaml', 'yarn.lock', 'composer.lock', 'go.sum', 'cargo.lock',
];

export function isIgnoredDiffFile(filename: string): boolean {
  const lower = (filename || '').toLowerCase();
  if (IGNORED_DIFF_FILENAMES.some((f) => lower.endsWith(f))) {
    return true;
  }
  if (IGNORED_DIFF_EXTENSIONS.some((ext) => lower.endsWith(ext))) {
    return true;
  }
  return false;
}

export function filterAndTruncateChangedFiles(
  files: Array<{ filename: string; status: string; patch?: string }>,
  maxIndividualPatchLength = 10000,
  maxTotalPatchLength = 40000,
): Array<{ filename: string; status: string; patch: string }> {
  let accumulatedLength = 0;
  const processedFiles: Array<{ filename: string; status: string; patch: string }> = [];

  for (const file of files) {
    if (isIgnoredDiffFile(file.filename)) {
      processedFiles.push({
        filename: file.filename,
        status: file.status,
        patch: '[Lockfile / binary / generated file diff omitted]',
      });
      continue;
    }

    let patch = file.patch || '';
    if (!patch) {
      processedFiles.push({
        filename: file.filename,
        status: file.status,
        patch: '',
      });
      continue;
    }

    // Cap individual patch
    if (patch.length > maxIndividualPatchLength) {
      patch = patch.substring(0, maxIndividualPatchLength) + `\n\n[Diff truncated for ${file.filename} due to size...]`;
    }

    // Check total limit
    if (accumulatedLength + patch.length > maxTotalPatchLength) {
      processedFiles.push({
        filename: file.filename,
        status: file.status,
        patch: '[Diff patch omitted due to total size limit]',
      });
    } else {
      accumulatedLength += patch.length;
      processedFiles.push({
        filename: file.filename,
        status: file.status,
        patch,
      });
    }
  }

  return processedFiles;
}
