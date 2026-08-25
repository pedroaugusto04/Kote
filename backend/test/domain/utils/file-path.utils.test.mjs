import test from 'node:test';
import assert from 'node:assert/strict';

import { normalizeFilePath } from '../../../dist/domain/utils/file-path.utils.js';

test('normalizeFilePath produces the canonical form shared by ingestion and lookup', () => {
  assert.equal(normalizeFilePath(' ./src\\billing\\retry.ts/ '), 'src/billing/retry.ts');
  assert.equal(normalizeFilePath('/src/billing/retry.ts'), 'src/billing/retry.ts');
  assert.equal(normalizeFilePath(undefined), '');
});
