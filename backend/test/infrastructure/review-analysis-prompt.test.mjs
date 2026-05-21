import test from 'node:test';
import assert from 'node:assert/strict';

import { buildReviewAnalysisSystemPrompt } from '../../dist/infrastructure/ai/prompts/review-analysis.prompt.js';

test('review analysis prompt asks for concise prioritized findings', () => {
  const prompt = buildReviewAnalysisSystemPrompt();

  assert.match(prompt, /average of 3 findings/);
  assert.match(prompt, /most relevant issues first/);
  assert.match(prompt, /include more only when additional observations are materially useful/);
  assert.match(prompt, /summary must state the problem and impact/);
  assert.match(prompt, /recommendation must state the concrete fix or improvement/);
});
