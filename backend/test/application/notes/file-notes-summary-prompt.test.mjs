import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildFileNotesSummaryPrompt,
  parseFileNotesSummaryResponse,
  FILE_NOTES_SUMMARY_MAX_NOTES,
  FILE_NOTES_SUMMARY_MAX_NOTE_CHARS,
  FILE_NOTES_SUMMARY_MAX_TOTAL_CHARS,
} from '../../../dist/infrastructure/ai/prompts/file-notes-summary.prompt.js';
import { FileNotesSummaryCacheService } from '../../../dist/application/services/content/file-notes-summary-cache.service.js';

test('file summary prompt bounds and chronologically orders its evidence', () => {
  const notes = Array.from({ length: 55 }, (_, index) => ({
    id: `note-${index}`,
    title: `Note ${index}`,
    date: new Date(Date.UTC(2026, 0, index + 1)).toISOString(),
    summary: `Summary ${index}`,
    content: `Content ${index} ${'x'.repeat(5_000)}`,
  })).reverse();

  const parsed = JSON.parse(buildFileNotesSummaryPrompt({ filePath: 'src/app.ts', notes }));
  const totalChars = parsed.notes.reduce((total, note) => total + note.content.length, 0);

  assert.equal(parsed.notes.length, FILE_NOTES_SUMMARY_MAX_NOTES);
  assert.equal(parsed.notes[0].id, 'note-5');
  assert.equal(parsed.notes.at(-1).id, 'note-54');
  assert.ok(parsed.notes.every((note) => note.content.length <= FILE_NOTES_SUMMARY_MAX_NOTE_CHARS));
  assert.ok(totalChars <= FILE_NOTES_SUMMARY_MAX_TOTAL_CHARS);
  assert.ok(parsed.notes.at(-1).content.length > 0);
});

test('file summary parser drops unknown note ids and sorts the timeline', () => {
  const result = parseFileNotesSummaryResponse({
    summary: 'Summary',
    understanding: 'Understanding',
    timeline: [
      { date: '2026-03-01', title: 'Later', description: 'Later', noteId: 'note-2' },
      { date: '2026-01-01', title: 'Earlier', description: 'Earlier', noteId: 'note-1' },
      { date: '2026-02-01', title: 'Invented', description: 'Invented', noteId: 'unknown' },
    ],
    keyChanges: [
      { description: 'Valid', noteId: 'note-1' },
      { description: 'Invented', noteId: 'unknown' },
    ],
  }, ['note-1', 'note-2']);

  assert.deepEqual(result.timeline.map((entry) => entry.noteId), ['note-1', 'note-2']);
  assert.deepEqual(result.keyChanges.map((entry) => entry.noteId), ['note-1']);
});

test('file summary cache is isolated by scope and invalidated by note revision', () => {
  const cache = new FileNotesSummaryCacheService();
  const scope = {
    userId: 'user-1',
    workspaceSlug: 'default',
    projectSlug: 'kote',
    filePath: 'src/app.ts',
  };
  const notes = [{ id: 'note-1', date: '2026-01-01', revision: 'revision-1' }];
  const summary = {
    summary: 'Cached summary',
    understanding: 'Cached understanding',
    timeline: [],
    keyChanges: [],
  };

  cache.set(scope, notes, summary);

  assert.equal(cache.get(scope, notes)?.summary, 'Cached summary');
  assert.equal(cache.get({ ...scope, userId: 'user-2' }, notes), null);
  assert.equal(cache.get(scope, [{ ...notes[0], revision: 'revision-2' }]), null);
});
