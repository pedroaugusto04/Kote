import test from 'node:test';
import assert from 'node:assert/strict';

import { buildUpdatedNote, extractEditableRawText } from '../../dist/application/use-cases/notes/note-editor.helpers.js';

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
      'Projeto: [[10 Projects/platform|Platform]]',
      '',
      '## Texto original',
      '',
      'Push recebido sem analise de IA configurada.',
      '',
      '## Resumo',
      '',
      'Push recebido sem analise de IA configurada.',
      '',
      '## Impacto',
      '',
      'Nenhum impacto adicional foi resumido.',
      '',
      '## Riscos',
      '',
      '- none',
      '',
      '## Proximos passos',
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
  const updated = buildUpdatedNote(note, null, null, {
    id: note.id,
    title: 'Review pedroaugusto04/Knowledge-Base 3882c230',
    rawText: 'Push revisado manualmente pelo editor.',
    tags: ['review'],
    reminderDate: '',
    reminderTime: '',
  });

  assert.equal(updated.summary, 'Push recebido sem analise de IA configurada.');
  assert.match(updated.markdown, /## Texto original/);
  assert.match(updated.markdown, /Push revisado manualmente pelo editor\./);
  assert.match(updated.markdown, /## Resumo/);
  assert.match(updated.markdown, /Push recebido sem analise de IA configurada\./);
  assert.match(updated.markdown, /## Findings de review/);
  assert.doesNotMatch(updated.markdown, /Projeto: \[\[10 Projects\/knowledge base\|pedroaugusto04\/Knowledge Base\]\] Texto original style:/);
});
