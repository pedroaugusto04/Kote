import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildNoteBodySearchText,
  resolveNoteBodySearchText,
  NOTE_BODY_SEARCH_TEXT_LIMIT,
} from '../../../dist/domain/utils/note-search-text.utils.js';

test('buildNoteBodySearchText strips markdown and keeps readable terms', () => {
  const text = buildNoteBodySearchText(`
# Deployment

Use \`KB_RAG_MIN_SIMILARITY\` in production.

See [docs](/path) for details.
  `);

  assert.match(text, /Deployment/);
  assert.match(text, /KB_RAG_MIN_SIMILARITY/);
  assert.match(text, /docs/);
  assert.doesNotMatch(text, /```/);
  assert.doesNotMatch(text, /\[docs\]/);
});

test('buildNoteBodySearchText returns empty for blank input', () => {
  assert.equal(buildNoteBodySearchText(''), '');
  assert.equal(buildNoteBodySearchText('   '), '');
});

test('buildNoteBodySearchText truncates very long content', () => {
  const longBody = 'a'.repeat(NOTE_BODY_SEARCH_TEXT_LIMIT + 500);
  assert.equal(buildNoteBodySearchText(longBody).length, NOTE_BODY_SEARCH_TEXT_LIMIT);
});

test('resolveNoteBodySearchText prefers markdown and falls back to metadata rawText', () => {
  assert.equal(
    resolveNoteBodySearchText('# Title\nBody text', { rawText: 'fallback' }),
    'Title Body text',
  );
  assert.equal(
    resolveNoteBodySearchText('', { rawText: 'Only raw text content' }),
    'Only raw text content',
  );
});
