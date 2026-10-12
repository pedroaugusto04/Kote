import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildReviewAnalysisSystemPrompt,
  parseReviewAnalysis,
  reviewAnalysisFallback,
} from '../../dist/infrastructure/ai/prompts/review-analysis.prompt.js';
import { ReviewFindingSeverity } from '../../dist/contracts/enums.js';

test('review analysis prompt generates non-empty system prompt with JSON instructions', () => {
  const prompt = buildReviewAnalysisSystemPrompt();

  assert.ok(typeof prompt === 'string' && prompt.length > 0);
  assert.match(prompt, /strict JSON/i);
});

test('parseReviewAnalysis returns fallback defaults for empty or undefined input', () => {
  const result = parseReviewAnalysis({});

  assert.equal(result.summary, reviewAnalysisFallback.summary);
  assert.equal(result.impact, reviewAnalysisFallback.impact);
  assert.deepEqual(result.risks, []);
  assert.deepEqual(result.nextSteps, []);
  assert.deepEqual(result.reviewFindings, []);
});

test('parseReviewAnalysis correctly parses valid input, maps severities, and sanitizes findings', () => {
  const result = parseReviewAnalysis({
    summary: 'Refactored auth module',
    impact: 'Improved login speed',
    risks: ['Cache invalidation'],
    nextSteps: ['Run integration tests'],
    reviewFindings: [
      {
        severity: ReviewFindingSeverity.Critical,
        file: 'auth.service.ts',
        summary: 'Missing token verification',
        recommendation: 'Verify JWT signature',
      },
      {
        severity: 'invalid-severity',
        file: 'utils.ts',
        summary: 'Unused import',
        recommendation: 'Remove it',
      },
      {
        severity: ReviewFindingSeverity.Low,
        file: 'empty.ts',
        summary: '', // should be filtered out
        recommendation: 'Nothing',
      },
    ],
  });

  assert.equal(result.summary, 'Refactored auth module');
  assert.equal(result.impact, 'Improved login speed');
  assert.deepEqual(result.risks, ['Cache invalidation']);
  assert.deepEqual(result.nextSteps, ['Run integration tests']);
  assert.equal(result.reviewFindings.length, 2);
  assert.equal(result.reviewFindings[0].severity, ReviewFindingSeverity.Critical);
  assert.equal(result.reviewFindings[0].file, 'auth.service.ts');
  assert.equal(result.reviewFindings[1].severity, ReviewFindingSeverity.Medium); // defaulted from invalid
  assert.equal(result.reviewFindings[1].file, 'utils.ts');
});
