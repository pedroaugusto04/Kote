import test from 'node:test';
import assert from 'node:assert/strict';

import { buildDashboardHome } from '../dist/application/use-cases/index.js';

const projects = [
  { projectSlug: 'alpha', displayName: 'Alpha', repoFullName: 'acme/alpha', workspaceSlug: 'default', aliases: [], defaultTags: [], enabled: true },
  { projectSlug: 'beta', displayName: 'Beta', repoFullName: 'acme/beta', workspaceSlug: 'default', aliases: [], defaultTags: [], enabled: true },
];

const baseNote = {
  id: 'note-base',
  path: '20 Inbox/base.md',
  type: 'event',
  title: 'Base',
  project: 'alpha',
  workspace: 'default',
  tags: [],
  date: '2026-04-27',
  status: 'open',
  summary: 'Base summary',
  source: 'test',
};

test('builds dashboard home metrics and keeps dashboard arrays independent', () => {
  const notes = [
    { ...baseNote, id: 'incident-1', path: '20 Inbox/incident.md', type: 'incident', title: 'Incidente aberto', summary: 'Investigar incidente.' },
    { ...baseNote, id: 'followup-1', path: '20 Inbox/followup.md', type: 'followup', title: 'Follow-up aberto', date: '2026-04-26' },
    { ...baseNote, id: 'decision-1', path: '20 Inbox/decision.md', type: 'decision', title: 'Decisao recente', project: 'beta', date: '2026-04-25' },
    { ...baseNote, id: 'event-1', path: '20 Inbox/event.md', type: 'event', title: 'Evento recente', project: 'beta', date: '2026-04-24' },
    { ...baseNote, id: 'closed-1', path: '20 Inbox/closed.md', type: 'incident', title: 'Incidente fechado', date: '2026-04-24', status: 'closed' },
    { ...baseNote, id: 'old-1', path: '20 Inbox/old.md', type: 'event', title: 'Evento antigo', date: '2026-04-01' },
  ];
  const reviews = [
    {
      id: 'review-1',
      title: 'Review com high',
      repo: 'acme/alpha',
      project: 'alpha',
      branch: 'main',
      date: '2026-04-27',
      status: 'open',
      summary: 'Review summary',
      impact: 'Alto',
      changedFiles: ['src/app.ts'],
      generatedNotePath: '30 Reviews/review.md',
      findings: [
        { severity: 'high', file: 'src/app.ts', line: 10, summary: 'Finding high', recommendation: 'Corrigir', status: 'open' },
        { severity: 'medium', file: 'src/app.ts', line: 12, summary: 'Finding medium', recommendation: 'Revisar', status: 'open' },
      ],
    },
  ];
  const reminders = [
    {
      id: 'reminder-overdue',
      title: 'Cobrar rollback',
      project: 'alpha',
      workspace: 'default',
      status: 'open',
      reminderDate: '2026-04-26',
      reminderTime: '09:00',
      reminderAt: '2026-04-26T09:00:00-03:00',
      relativePath: '30 Reminders/overdue.md',
      sourceNotePath: '20 Inbox/incident.md',
    },
    {
      id: 'reminder-upcoming',
      title: 'Validar deploy',
      project: 'beta',
      workspace: 'default',
      status: 'active',
      reminderDate: '2026-04-27',
      reminderTime: '16:00',
      reminderAt: '2026-04-27T16:00:00-03:00',
      relativePath: '30 Reminders/upcoming.md',
      sourceNotePath: '20 Inbox/event.md',
    },
    {
      id: 'reminder-done',
      title: 'Feito',
      project: 'beta',
      workspace: 'default',
      status: 'done',
      reminderDate: '2026-04-25',
      reminderTime: '09:00',
      reminderAt: '2026-04-25T09:00:00-03:00',
      relativePath: '30 Reminders/done.md',
      sourceNotePath: '',
    },
  ];

  const home = buildDashboardHome(projects, notes, reviews, reminders, new Date('2026-04-27T12:00:00-03:00'));

  assert.equal(home.windowDays, 7);
  assert.equal(home.metrics.find((metric) => metric.id === 'open-reminders')?.value, 2);
  assert.equal(home.metrics.find((metric) => metric.id === 'open-reminders')?.meta, '1 vencidos');
  assert.equal(home.metrics.find((metric) => metric.id === 'open-findings')?.value, 1);
  assert.equal(home.activityByDay.length, 7);
  assert.deepEqual(home.activityByProject.map((project) => project.project), ['alpha', 'beta']);
  assert.equal(home.priorities.length, 5);
  assert.deepEqual(home.priorities.map((priority) => priority.id), [
    'reminder:reminder-overdue',
    'reminder:reminder-upcoming',
    'finding:review-1:0',
    'note:incident-1',
    'note:followup-1',
  ]);
  assert.deepEqual(home.recentInterestingEvents.map((event) => event.id), ['incident-1', 'decision-1', 'followup-1', 'event-1']);
});
