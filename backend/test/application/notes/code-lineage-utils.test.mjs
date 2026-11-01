import test from 'node:test';
import assert from 'node:assert/strict';

import {
  classifyDirectLineageMatch,
  CODE_LINEAGE_RELEVANCE_THRESHOLDS,
} from '../../../dist/application/utils/notes/code-lineage.utils.js';

const relevance = (overrides = {}) => ({
  category: 'same-file',
  score: 0.5,
  contentScore: 0.5,
  isOriginMatch: false,
  reason: 'test',
  ...overrides,
});

test('direct lineage categories are decided in the backend', () => {
  assert.equal(
    classifyDirectLineageMatch(
      { sourceChannel: 'ai-chat', source: 'codex' },
      relevance({ isOriginMatch: true }),
    ),
    'origin',
  );
  assert.equal(
    classifyDirectLineageMatch(
      { sourceChannel: 'github', source: 'github push' },
      relevance({ contentScore: CODE_LINEAGE_RELEVANCE_THRESHOLDS.sameFileContent }),
    ),
    'linked-commit',
  );
  assert.equal(
    classifyDirectLineageMatch(
      { sourceChannel: 'github', source: 'github push' },
      relevance({ contentScore: 0.1 }),
    ),
    null,
  );
  assert.equal(
    classifyDirectLineageMatch(
      { sourceChannel: 'ide', source: 'ide' },
      relevance({ contentScore: CODE_LINEAGE_RELEVANCE_THRESHOLDS.sameFileContent }),
    ),
    'same-file',
  );
  assert.equal(
    classifyDirectLineageMatch(
      { sourceChannel: 'ide', source: 'ide' },
      relevance({ contentScore: CODE_LINEAGE_RELEVANCE_THRESHOLDS.sameFileContent - 0.01 }),
    ),
    null,
  );
  assert.equal(
    classifyDirectLineageMatch(
      {
        sourceChannel: 'ai-chat',
        source: 'claude-code',
        linkedCommits: [{
          id: 'c1',
          commitSha: '1234567',
          shortSha: '1234567',
          message: 'fix',
          authorName: 'Pedro',
          committedAt: '2026-08-01T00:00:00Z',
          branch: 'main',
          htmlUrl: null,
          linkSource: 'session_files',
          confidence: 80,
          matchedFiles: ['src/app.ts'],
        }],
      },
      relevance({ contentScore: CODE_LINEAGE_RELEVANCE_THRESHOLDS.sameFileContent }),
    ),
    'linked-commit',
  );
});
