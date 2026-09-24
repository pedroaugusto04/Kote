import test from 'node:test';
import assert from 'node:assert/strict';

import {
  filterAndTruncateChangedFiles,
  isIgnoredDiffFile,
} from '../../../../dist/application/utils/github/github-diff-filter.utils.js';

test('isIgnoredDiffFile identifies lockfiles, binary files, and generated maps', () => {
  assert.equal(isIgnoredDiffFile('package-lock.json'), true);
  assert.equal(isIgnoredDiffFile('pnpm-lock.yaml'), true);
  assert.equal(isIgnoredDiffFile('bundle.js.map'), true);
  assert.equal(isIgnoredDiffFile('image.png'), true);
  assert.equal(isIgnoredDiffFile('src/index.ts'), false);
});

test('filterAndTruncateChangedFiles replaces lockfiles and truncates oversized diffs', () => {
  const files = [
    { filename: 'pnpm-lock.yaml', status: 'modified', patch: 'lots of lines' },
    { filename: 'src/main.ts', status: 'modified', patch: 'const a = 1;' },
  ];

  const processed = filterAndTruncateChangedFiles(files);
  assert.equal(processed[0].patch, '[Lockfile / binary / generated file diff omitted]');
  assert.equal(processed[1].patch, 'const a = 1;');
});

test('filterAndTruncateChangedFiles respects individual patch limit', () => {
  const longPatch = 'a'.repeat(150);
  const files = [{ filename: 'src/big.ts', status: 'modified', patch: longPatch }];
  const processed = filterAndTruncateChangedFiles(files, 50, 100);

  assert.ok(processed[0].patch.includes('[Diff truncated for src/big.ts due to size...]'));
  assert.equal(processed[0].patch.startsWith('a'.repeat(50)), true);
});
