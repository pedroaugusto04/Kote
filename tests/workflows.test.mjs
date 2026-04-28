import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.dirname(__dirname);

test('workflow adapters use internal HTTP API and avoid embedded credentials', async () => {
  const workflowsDir = path.join(repoRoot, 'workflows');
  const files = (await fs.readdir(workflowsDir)).filter((file) => file.endsWith('.json'));
  assert.ok(files.length >= 4);

  for (const file of files) {
    const raw = await fs.readFile(path.join(workflowsDir, file), 'utf8');
    assert.doesNotMatch(raw, /\/home\/node\/knowledge-base\/dist\/cli\//);
    assert.doesNotMatch(raw, /executeCommand/);
    assert.match(raw, /n8n-nodes-base\.httpRequest/);
    assert.match(raw, /KB_INTERNAL_SERVICE_TOKEN/);
    assert.doesNotMatch(raw, /"credentials"\s*:/);
  }
});
