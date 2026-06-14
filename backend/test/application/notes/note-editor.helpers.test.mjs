import test from 'node:test';
import assert from 'node:assert/strict';

import { buildUpdatedNote, extractEditableRawText } from '../../../dist/application/use-cases/notes/note-editor.helpers.js';

function structuredReviewNote() {
  return {
    id: 'note-1',
    path: '20 Inbox/platform/review.md',
    type: 'event',
    title: 'Review pedroaugusto04/Knowledge-Base 3882c230',
    projectSlug: 'platform',
    workspaceSlug: 'default',
    folderId: null,
    status: 'active',
    tags: ['review'],
    occurredAt: '2026-05-07T12:00:00.000Z',
    sourceChannel: 'github-push',
    summary: 'Push recebido sem analise de IA configurada.',
    markdown: [
      '---',
      'id: "review:1"',
      'type: "event"',
      'workspace: "default"',
      'project: "platform"',
      'status: "active"',
      'tags: ["review"]',
      'occurred_at: "2026-05-07T12:00:00.000Z"',
      '---',
      '',
      '# Review pedroaugusto04/Knowledge-Base 3882c230',
      '',
      'Project: Platform',
      '',
      '## Original text',
      '',
      'Push recebido sem analise de IA configurada.',
      '',
      '## Summary',
      '',
      'Push recebido sem analise de IA configurada.',
      '',
      '## Impact',
      '',
      'Nenhum impacto adicional foi resumido.',
      '',
      '## Risks',
      '',
      '- none',
      '',
      '## Next steps',
      '',
      '- none',
      '',
      '## Findings de review',
      '',
      'No findings registered.',
      '',
    ].join('\n'),
    frontmatter: { id: 'review:1' },
    metadata: { manual: false },
    origin: 'postgres',
    source: 'github-push',
    links: [],
  };
}

test('extracts only the original text from structured notes', () => {
  const note = structuredReviewNote();
  assert.equal(extractEditableRawText(note), 'Push recebido sem analise de IA configurada.');
});

test('preserves structured markdown sections when updating a structured note', () => {
  const note = structuredReviewNote();
  const updated = buildUpdatedNote(
    note,
    null,
    null,
    {
      id: note.id,
      title: 'Review pedroaugusto04/Knowledge-Base 3882c230',
      rawText: 'Push revisado manualmente pelo editor.',
      tags: ['review'],
      reminderDate: '',
      reminderTime: '',
    },
    'America/Sao_Paulo',
  );

  assert.equal(updated.summary, 'Push recebido sem analise de IA configurada.');
  assert.match(updated.markdown, /## Original text/);
  assert.match(updated.markdown, /Push revisado manualmente pelo editor\./);
  assert.match(updated.markdown, /## Summary/);
  assert.match(updated.markdown, /Push recebido sem analise de IA configurada\./);
  assert.match(updated.markdown, /## Findings de review/);
  assert.doesNotMatch(updated.markdown, /Project: \[\[10 Projects\/knowledge base\|pedroaugusto04\/Knowledge Base\]\] Original text style:/);
});

test('can reopen resolved or archived notes back to active status', () => {
  const note = structuredReviewNote();

  const reopenedFromResolved = buildUpdatedNote(
    { ...note, status: 'resolved' },
    null,
    null,
    {
      id: note.id,
      title: note.title,
      rawText: 'Push revisado manualmente pelo editor.',
      tags: ['review'],
      status: 'active',
      reminderDate: '',
      reminderTime: '',
    },
    'America/Sao_Paulo',
  );

  const reopenedFromArchived = buildUpdatedNote(
    { ...note, status: 'archived' },
    null,
    null,
    {
      id: note.id,
      title: note.title,
      rawText: 'Push revisado manualmente pelo editor.',
      tags: ['review'],
      status: 'active',
      reminderDate: '',
      reminderTime: '',
    },
    'America/Sao_Paulo',
  );

  assert.equal(reopenedFromResolved.status, 'active');
  assert.equal(reopenedFromArchived.status, 'active');
});

test('extracts editable raw text and strips duplicate title headers', () => {
  const note = {
    id: 'note-2',
    path: '20 Inbox/platform/note.md',
    type: 'event',
    title: 'My Custom Note',
    projectSlug: 'platform',
    workspaceSlug: 'default',
    folderId: null,
    status: 'active',
    tags: [],
    occurredAt: '2026-05-07T12:00:00.000Z',
    summary: 'Content text.',
    markdown: '# My Custom Note\n\nContent text.',
    frontmatter: {},
    metadata: { rawText: '# My Custom Note\n\nContent text.' },
    origin: 'postgres',
    source: 'ai-chat',
    links: [],
  };

  assert.equal(extractEditableRawText(note), 'Content text.');
});

test('buildUpdatedNote strips duplicate title header from new rawText', () => {
  const note = {
    id: 'note-2',
    path: '20 Inbox/platform/note.md',
    type: 'event',
    title: 'My Custom Note',
    projectSlug: 'platform',
    workspaceSlug: 'default',
    folderId: null,
    status: 'active',
    tags: [],
    occurredAt: '2026-05-07T12:00:00.000Z',
    summary: '',
    markdown: '',
    frontmatter: {},
    metadata: {},
    origin: 'postgres',
    source: 'ai-chat',
    links: [],
  };

  const updated = buildUpdatedNote(
    note,
    null,
    null,
    {
      id: note.id,
      title: 'My Custom Note',
      rawText: '# My Custom Note\n\nSome updated content.',
      tags: [],
      reminderDate: '',
      reminderTime: '',
    },
    'America/Sao_Paulo',
  );

  assert.equal(updated.metadata.rawText, 'Some updated content.');
});

