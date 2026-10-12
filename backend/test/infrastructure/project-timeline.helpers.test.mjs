import test from 'node:test';
import assert from 'node:assert/strict';

import {
  projectTimelineCategory,
  hasTimelineReminder,
  appendTimelineFolderClause,
  appendTimelineCategoryClause,
  appendTimelineStatusClause,
  appendTimelineSearchClause,
  appendKnowledgeMapFilters,
  RAW_CATEGORIES_JSON_AGG_SQL,
} from '../../dist/infrastructure/repositories/utils/project-timeline.helpers.js';
import { SourceChannel, TimelineCategory } from '../../dist/contracts/enums.js';

test('projectTimelineCategory derives correct timeline categories', () => {
  assert.equal(projectTimelineCategory({ reminderAt: '2026-05-01T00:00:00.000Z', sourceChannel: SourceChannel.Github, source: '', metadata: {} }), TimelineCategory.Reminder);
  assert.equal(projectTimelineCategory({ reminderAt: null, sourceChannel: SourceChannel.Github, source: '', metadata: {} }), TimelineCategory.Github);
  assert.equal(projectTimelineCategory({ reminderAt: null, sourceChannel: 'github-push', source: '', metadata: {} }), TimelineCategory.Github);
  assert.equal(projectTimelineCategory({ reminderAt: null, sourceChannel: SourceChannel.Whatsapp, source: '', metadata: {} }), TimelineCategory.Whatsapp);
  assert.equal(projectTimelineCategory({ reminderAt: null, sourceChannel: SourceChannel.AiChat, source: '', metadata: {} }), TimelineCategory.AiChat);
  assert.equal(projectTimelineCategory({ reminderAt: null, sourceChannel: SourceChannel.DependencyWatcher, source: '', metadata: {} }), TimelineCategory.DependencyWatcher);
  assert.equal(projectTimelineCategory({ reminderAt: null, sourceChannel: SourceChannel.Cli, source: '', metadata: {} }), TimelineCategory.Manual);
  assert.equal(projectTimelineCategory({ reminderAt: null, sourceChannel: SourceChannel.Ide, source: '', metadata: {} }), TimelineCategory.Manual);
  assert.equal(projectTimelineCategory({ reminderAt: null, sourceChannel: 'unknown', source: '', metadata: {} }), TimelineCategory.Manual);
});

test('hasTimelineReminder checks reminder presence', () => {
  assert.equal(hasTimelineReminder({ reminderAt: '2026-05-01' }), true);
  assert.equal(hasTimelineReminder({ reminderAt: null }), false);
  assert.equal(hasTimelineReminder({ reminderAt: undefined }), false);
});

test('appendTimelineFolderClause builds sql parameters correctly', () => {
  const clauses = [];
  const values = ['user-1'];

  appendTimelineFolderClause(clauses, values, 'folder-1', undefined);
  assert.deepEqual(clauses, ['n.folder_id = $2']);
  assert.deepEqual(values, ['user-1', 'folder-1']);

  const multiClauses = [];
  const multiValues = ['user-1'];
  appendTimelineFolderClause(multiClauses, multiValues, undefined, ['f1', 'f2']);
  assert.deepEqual(multiClauses, ['n.folder_id in ($2, $3)']);
  assert.deepEqual(multiValues, ['user-1', 'f1', 'f2']);
});

test('appendTimelineCategoryClause appends category filtering clauses', () => {
  const allClauses = [];
  const allValues = ['user-1'];
  appendTimelineCategoryClause(allClauses, allValues, TimelineCategory.All);
  assert.equal(allClauses.length, 0);

  const remClauses = [];
  const remValues = ['user-1'];
  appendTimelineCategoryClause(remClauses, remValues, TimelineCategory.Reminder);
  assert.deepEqual(remClauses, ['(n.reminder_at IS NOT NULL)']);

  const ghClauses = [];
  const ghValues = ['user-1'];
  appendTimelineCategoryClause(ghClauses, ghValues, TimelineCategory.Github);
  assert.deepEqual(ghClauses, ['(n.reminder_at IS NULL)', 'n.source_channel = $2']);
  assert.deepEqual(ghValues, ['user-1', SourceChannel.Github]);
});

test('RAW_CATEGORIES_JSON_AGG_SQL contains json_agg fragment', () => {
  assert.equal(RAW_CATEGORIES_JSON_AGG_SQL.includes('json_agg'), true);
  assert.equal(RAW_CATEGORIES_JSON_AGG_SQL.includes('cat.id'), true);
});

test('appendTimelineStatusClause handles open status and specific statuses', () => {
  const openClauses = [];
  const openValues = ['user-1'];
  appendTimelineStatusClause(openClauses, openValues, 'open', ['closed', 'archived']);
  assert.deepEqual(openClauses, ['(n.status is null or n.status != all($2::note_status_enum[]))']);
  assert.deepEqual(openValues, ['user-1', ['closed', 'archived']]);

  const specificClauses = [];
  const specificValues = ['user-1'];
  appendTimelineStatusClause(specificClauses, specificValues, 'draft', ['closed', 'archived']);
  assert.deepEqual(specificClauses, ['n.status::text = $2']);
  assert.deepEqual(specificValues, ['user-1', 'draft']);

  const undefinedClauses = [];
  const undefinedValues = ['user-1'];
  appendTimelineStatusClause(undefinedClauses, undefinedValues, undefined, ['closed']);
  assert.equal(undefinedClauses.length, 0);
});

test('appendTimelineSearchClause formats like clauses for search terms', () => {
  const clauses = [];
  const values = ['user-1'];
  appendTimelineSearchClause(clauses, values, 'postgres auth');
  assert.equal(clauses.length, 1);
  assert.ok(clauses[0].includes('lower(n.title) like $2'));
  assert.deepEqual(values, ['user-1', '%postgres auth%']);

  const emptyClauses = [];
  const emptyValues = ['user-1'];
  appendTimelineSearchClause(emptyClauses, emptyValues, '   ');
  assert.equal(emptyClauses.length, 0);
});

test('appendKnowledgeMapFilters adds dependency watcher and review exclusions', () => {
  const clauses = [];
  const values = ['user-1'];
  appendKnowledgeMapFilters(clauses, values, TimelineCategory.All, true);
  assert.equal(clauses.length, 2);
  assert.ok(clauses[0].includes('source_channel <>'));
  assert.ok(clauses[1].includes('NOT (n.source_channel ='));
});

