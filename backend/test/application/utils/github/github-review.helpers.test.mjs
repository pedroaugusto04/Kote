import test from 'node:test';
import assert from 'node:assert/strict';

import {
  isCommentForShaAlreadyPosted,
  isRelevantAiComment,
  formatPullRequestCommentWithSha,
  buildPrContextSummary,
  hasHighSeverityReviewFindings,
  GITHUB_COMMENT_CHAR_LIMIT,
  searchSemanticPrContextChunks,
  ingestPrReviewNote,
} from '../../../../dist/application/utils/github/github-review.helpers.js';

test('isCommentForShaAlreadyPosted detects duplicate marker correctly', () => {
  const comments = [
    { body: 'Some previous comment without marker' },
    { body: 'Review comment\n\n<!-- sha: 1a2b3c -->\n' },
  ];

  assert.equal(isCommentForShaAlreadyPosted(comments, '1a2b3c'), true);
  assert.equal(isCommentForShaAlreadyPosted(comments, '4d5e6f'), false);
  assert.equal(isCommentForShaAlreadyPosted([], '1a2b3c'), false);
});

test('isRelevantAiComment filters out empty, NONE, and whitespace-only responses', () => {
  assert.equal(isRelevantAiComment('Here is some relevant context for the PR'), true);
  assert.equal(isRelevantAiComment(''), false);
  assert.equal(isRelevantAiComment('   '), false);
  assert.equal(isRelevantAiComment('NONE'), false);
  assert.equal(isRelevantAiComment('none'), false);
  assert.equal(isRelevantAiComment('  None  '), false);
  assert.equal(isRelevantAiComment(undefined), false);
});

test('formatPullRequestCommentWithSha appends sha marker and keeps comment intact when below limit', () => {
  const result = formatPullRequestCommentWithSha('Good PR', 'abc1234');
  assert.equal(result.isTruncated, false);
  assert.equal(result.comment, 'Good PR\n\n<!-- sha: abc1234 -->');
});

test('formatPullRequestCommentWithSha truncates comment when exceeding GitHub character limit', () => {
  const hugeComment = 'A'.repeat(GITHUB_COMMENT_CHAR_LIMIT + 500);
  const result = formatPullRequestCommentWithSha(hugeComment, 'abc1234');
  assert.equal(result.isTruncated, true);
  assert.ok(result.comment.length <= GITHUB_COMMENT_CHAR_LIMIT);
  assert.ok(result.comment.includes('<!-- sha: abc1234 -->'));
  assert.ok(result.comment.includes('Comment truncated due to GitHub character limit'));
});

test('buildPrContextSummary formats markdown bullet points for chunks', () => {
  assert.equal(buildPrContextSummary([]), undefined);

  const chunks = [
    { title: 'Auth Service', chunkText: 'Handles JWT tokens' },
    { title: 'Billing', chunkText: 'Manages stripe payments' },
  ];
  const summary = buildPrContextSummary(chunks);
  assert.ok(summary);
  assert.ok(summary.includes('- Auth Service: Handles JWT tokens...'));
  assert.ok(summary.includes('- Billing: Manages stripe payments...'));
});

test('hasHighSeverityReviewFindings detects high and critical severities', () => {
  assert.equal(hasHighSeverityReviewFindings([{ severity: 'low' }, { severity: 'medium' }]), false);
  assert.equal(hasHighSeverityReviewFindings([{ severity: 'low' }, { severity: 'high' }]), true);
  assert.equal(hasHighSeverityReviewFindings([{ severity: 'critical' }]), true);
});

test('searchSemanticPrContextChunks returns empty array when searchTerms is empty', async () => {
  const result = await searchSemanticPrContextChunks(
    { embeddingQueue: {}, noteEmbeddingRepository: {}, contentRepository: {} },
    { userId: 'u1', searchTerms: '', minSimilarity: 0.5, repository: 'repo', projectSlug: 'slug' },
  );
  assert.deepEqual(result, []);
});

test('searchSemanticPrContextChunks queries embeddings and resolves note details', async () => {
  const deps = {
    embeddingQueue: {
      publishQueryEmbedding: async () => [[0.1, 0.2, 0.3]],
    },
    noteEmbeddingRepository: {
      findSimilar: async () => [{ noteId: 'note-1', chunkText: 'Relevant text' }],
    },
    contentRepository: {
      getNotesByIds: async () => [{ id: 'note-1', title: 'Note 1', path: '/docs/note-1.md', projectSlug: 'proj-1', workspaceId: 'ws-1' }],
    },
  };

  const result = await searchSemanticPrContextChunks(deps, {
    userId: 'u1',
    workspaceId: 'ws-1',
    searchTerms: 'authentication tokens',
    minSimilarity: 0.5,
    repository: 'acme/api',
    projectSlug: 'proj-1',
  });

  assert.equal(result.length, 1);
  assert.deepEqual(result[0], {
    noteId: 'note-1',
    title: 'Note 1',
    path: '/docs/note-1.md',
    projectSlug: 'proj-1',
    workspaceId: 'ws-1',
    chunkText: 'Relevant text',
  });
});

test('ingestPrReviewNote calls ingestEntryUseCase with resolved project payload', async () => {
  let executedPayload = null;
  const deps = {
    ingestEntryUseCase: {
      execute: async (payload) => {
        executedPayload = payload;
        return { noteId: 'created-note-1' };
      },
    },
  };

  const result = await ingestPrReviewNote(deps, {
    input: { headers: {}, body: {} },
    commentText: 'LGTM',
    changedFiles: [],
    contextSummary: 'summary',
    projectSlug: 'backend-api',
    identity: { userId: 'u1', workspaceSlug: 'default' },
    repoFullName: 'acme/api',
    prNumber: 42,
    buildPrContextNoteEvent: () => ({
      event: { projectSlug: 'old-slug' },
      classification: { tags: ['old-slug'] },
    }),
  });

  assert.equal(result, 'created-note-1');
  assert.equal(executedPayload.event.projectSlug, 'backend-api');
  assert.ok(executedPayload.classification.tags.includes('code-review'));
});

