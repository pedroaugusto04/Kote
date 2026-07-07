import test from 'node:test';
import assert from 'node:assert/strict';

import {
  scoreChunkLexicalOverlap,
  computeFtsOnlyChunkKeywordScore,
  selectTopFtsOnlyChunksPerNote,
  DEFAULT_FTS_ONLY_CHUNKS_PER_NOTE,
} from '../../../dist/application/utils/query.utils.js';

test('scoreChunkLexicalOverlap returns matched token ratio', () => {
  assert.equal(scoreChunkLexicalOverlap('rollback deploy', 'Use rollback before deploy.'), 1);
  assert.equal(scoreChunkLexicalOverlap('rollback deploy', 'Intro paragraph only.'), 0);
  assert.equal(scoreChunkLexicalOverlap('rollback deploy', 'Partial rollback steps.'), 0.5);
});

test('computeFtsOnlyChunkKeywordScore blends fts rank with lexical overlap', () => {
  assert.ok(Math.abs(computeFtsOnlyChunkKeywordScore(0.2, 1) - 0.3) < 1e-9);
  assert.ok(Math.abs(computeFtsOnlyChunkKeywordScore(0.2, 0) - 0.02) < 1e-9);
  assert.equal(computeFtsOnlyChunkKeywordScore(0, 0.75), 0.75);
});

test('selectTopFtsOnlyChunksPerNote prefers lexically matching chunks and caps per note', () => {
  const chunks = [
    { noteId: 'note-1', chunkIndex: 0, chunkText: 'Introduction and overview.' },
    { noteId: 'note-1', chunkIndex: 1, chunkText: 'Rollback steps for production deploy.' },
    { noteId: 'note-1', chunkIndex: 2, chunkText: 'Another rollback checklist item.' },
    { noteId: 'note-1', chunkIndex: 3, chunkText: 'Rollback verification notes.' },
    { noteId: 'note-1', chunkIndex: 4, chunkText: 'Rollback cleanup after deploy.' },
    { noteId: 'note-2', chunkIndex: 0, chunkText: 'Unrelated note body.' },
  ];

  const selected = selectTopFtsOnlyChunksPerNote(
    chunks,
    'rollback deploy',
    new Map([
      ['note-1', 0.12],
      ['note-2', 0.08],
    ]),
    DEFAULT_FTS_ONLY_CHUNKS_PER_NOTE,
  );

  assert.equal(selected.length, 4);
  assert.deepEqual(
    selected.filter((item) => item.chunk.noteId === 'note-1').map((item) => item.chunk.chunkIndex),
    [1, 4, 2],
  );
  assert.equal(selected.find((item) => item.chunk.noteId === 'note-2')?.chunk.chunkIndex, 0);
  assert.ok(selected.every((item) => item.keywordScore > 0));
});

test('selectTopFtsOnlyChunksPerNote keeps first chunk when no lexical match exists', () => {
  const chunks = [
    { noteId: 'note-1', chunkIndex: 0, chunkText: 'Title-only match context.' },
    { noteId: 'note-1', chunkIndex: 1, chunkText: 'More generic content.' },
  ];

  const selected = selectTopFtsOnlyChunksPerNote(
    chunks,
    'rollback',
    new Map([['note-1', 0.1]]),
  );

  assert.equal(selected.length, 1);
  assert.equal(selected[0].chunk.chunkIndex, 0);
  assert.equal(selected[0].lexicalScore, 0);
});
