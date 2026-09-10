import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildSynthesisRetrievalChunks,
  formatSynthesisForRetrieval,
} from '../../../dist/application/services/content/ai-session-synthesis-transcript.service.js';

test('buildSynthesisRetrievalChunks preserves refs per grouped memory block and includes files/entities', () => {
  const chunks = buildSynthesisRetrievalChunks('The deployment approach was selected.', [
    { kind: 'decision', text: 'Use the blue-green deployment strategy.', status: 'current', turnRefs: [3], files: ['deploy.yml'], entities: ['staging'] },
    { kind: 'open_item', text: 'Validate rollback timing in production.', status: 'current', turnRefs: [5], files: [], entities: [] },
  ]);

  assert.equal(chunks.length, 1);
  assert.deepEqual(chunks[0].sourceRefs, [3, 5]);
  assert.match(chunks[0].chunkText, /Files: deploy\.yml/);
  assert.match(chunks[0].chunkText, /Entities: staging/);
  assert.match(chunks[0].chunkText, /open item \[current\]/);
});

test('formatSynthesisForRetrieval remains a compact plain-text representation', () => {
  const result = formatSynthesisForRetrieval('Overview', [
    { kind: 'goal', text: 'Ship the fix.', status: 'current', turnRefs: [1] },
  ]);
  assert.equal(result, 'Session overview: Overview\ngoal [current]: Ship the fix.');
});
