import test from 'node:test';
import assert from 'node:assert/strict';

import {
  toFindRelatedNotesByFileInput,
  toGenerateFileNotesSummaryInput,
  toFindNotesByFileOptions,
  toSetAutoActionGlobalInput,
  toFindNotesBySnippetInput,
} from '../../../dist/interfaces/http/mappers/note.mapper.js';
import {
  toExportProjectNotesZipInput,
  toListProjectTimelineInput,
  toListProjectKnowledgeMapInput,
  toListProjectDecisionsInput,
  toExportProjectAdrsInput,
} from '../../../dist/interfaces/http/mappers/project.mapper.js';
import { toRunAskAiInput } from '../../../dist/interfaces/http/mappers/ask.mapper.js';
import { toProcessAgentConversationInput } from '../../../dist/interfaces/http/mappers/operations.mapper.js';
import { toUpdateSubscriptionInput } from '../../../dist/interfaces/http/mappers/subscription.mapper.js';
import { toQueryKnowledgeInput } from '../../../dist/interfaces/http/mappers/query.mapper.js';
import { toAiTokenAnalyticsFilter } from '../../../dist/interfaces/http/mappers/dashboard.mapper.js';
import { COUNTRY_CODE } from '../../../dist/domain/constants/billing.constants.js';
import { BillingCycle, BillingType } from '../../../dist/domain/enums/billing.enums.js';

test('note.mapper transforms query and scope into findRelatedNotes input', () => {
  const query = {
    filePath: 'src/app.ts',
    excludeIds: ['id1', 'id2'],
    query: 'auth middleware',
    limit: 5,
    searchProfile: 'file',
  };
  const scope = { projectSlug: 'backend-core' };
  const input = toFindRelatedNotesByFileInput(query, 'user-123', scope);

  assert.equal(input.userId, 'user-123');
  assert.equal(input.filePath, 'src/app.ts');
  assert.deepEqual(input.excludeIds, ['id1', 'id2']);
  assert.equal(input.customQuery, 'auth middleware');
  assert.equal(input.projectSlug, 'backend-core');
  assert.equal(input.requestedLimit, 5);
  assert.equal(input.searchProfile, 'file');
});

test('note.mapper transforms query and scope into fileNotesSummary input', () => {
  const query = { filePath: 'README.md', workspaceSlug: 'default' };
  const scope = { projectSlug: 'my-project', workspaceSlug: 'ws-custom' };
  const input = toGenerateFileNotesSummaryInput(query, scope);

  assert.equal(input.filePath, 'README.md');
  assert.equal(input.workspaceSlug, 'ws-custom');
  assert.equal(input.projectSlug, 'my-project');
});

test('note.mapper transforms autoActionGlobal payload', () => {
  const input = toSetAutoActionGlobalInput({ enabled: true, action: 'archive', afterHours: 48 });
  assert.deepEqual(input, { enabled: true, action: 'archive', afterHours: 48 });

  const nullHours = toSetAutoActionGlobalInput({ enabled: false, action: 'resolve' });
  assert.deepEqual(nullHours, { enabled: false, action: 'resolve', afterHours: null });
});

test('project.mapper transforms queries and scope into use case inputs', () => {
  const zipQuery = { folderId: 'folder-1', category: 'code', status: 'active', query: 'keyword' };
  const scope = { projectId: 'p-1', projectSlug: 'slug-1' };
  const zipInput = toExportProjectNotesZipInput(zipQuery, scope);

  assert.equal(zipInput.projectId, 'p-1');
  assert.equal(zipInput.projectSlug, 'slug-1');
  assert.equal(zipInput.folderId, 'folder-1');
  assert.equal(zipInput.category, 'code');

  const timelineInput = toListProjectTimelineInput({ page: 2 }, scope);
  assert.equal(timelineInput.page, 2);
  assert.equal(timelineInput.projectId, 'p-1');
  assert.equal(timelineInput.orderByPin, true);

  const decisionsInput = toListProjectDecisionsInput({ status: 'accepted', file: 'auth.ts' }, scope);
  assert.equal(decisionsInput.projectSlug, 'slug-1');
  assert.equal(decisionsInput.status, 'accepted');
  assert.equal(decisionsInput.file, 'auth.ts');
});

test('ask.mapper transforms request and scope into runAskAi input', () => {
  const body = { question: 'how does auth work?', conversationId: 'conv-123' };
  const scope = { projectId: 'proj-1', workspaceId: 'ws-1' };
  const input = toRunAskAiInput(body, 'user-456', scope);

  assert.equal(input.question, 'how does auth work?');
  assert.equal(input.userId, 'user-456');
  assert.equal(input.scope?.projectId, 'proj-1');
  assert.equal(input.scope?.workspaceId, 'ws-1');
  assert.equal(input.conversationId, 'conv-123');
});

test('operations.mapper transforms conversation body and scope into agent input', () => {
  const body = { messageText: 'hello agent', chatId: 'chat-1' };
  const scope = { workspaceSlug: 'ws-team', projectSlug: 'proj-team' };
  const input = toProcessAgentConversationInput(body, 'user-789', scope);

  assert.deepEqual(input.input, body);
  assert.equal(input.userId, 'user-789');
  assert.equal(input.workspaceSlug, 'ws-team');
  assert.equal(input.projectSlug, 'proj-team');
});

test('subscription.mapper transforms update subscription payload with headers', () => {
  const body = {
    planId: 'pro',
    billingCycle: BillingCycle.Monthly,
    billingType: BillingType.CreditCard,
  };
  const user = { id: 'user-sub', email: 'user@example.com', displayName: 'Jane Doe' };
  const input = toUpdateSubscriptionInput(body, user, {
    acceptLanguageHeader: 'pt-BR,pt;q=0.9',
  });

  assert.equal(input.userId, 'user-sub');
  assert.equal(input.email, 'user@example.com');
  assert.equal(input.displayName, 'Jane Doe');
  assert.equal(input.planId, 'pro');
  assert.equal(input.countryCode, COUNTRY_CODE.BRAZIL);
});

test('query.mapper transforms query request and scope into queryInput', () => {
  const query = { query: 'typeorm or drizzle', page: 1, pageSize: 20 };
  const scope = { projectId: 'proj-db', workspaceId: 'ws-db' };
  const input = toQueryKnowledgeInput(query, scope);

  assert.equal(input.query, 'typeorm or drizzle');
  assert.equal(input.page, 1);
  assert.equal(input.pageSize, 20);
  assert.equal(input.projectId, 'proj-db');
  assert.equal(input.workspaceId, 'ws-db');
});

test('dashboard.mapper transforms aiAnalytics query and scope into filter', () => {
  const query = { startDate: '2026-01-01', endDate: '2026-01-31', model: 'gpt-4o' };
  const scope = { projectId: 'proj-dash', workspaceId: 'ws-dash' };
  const filter = toAiTokenAnalyticsFilter(query, scope);

  assert.equal(filter.startDate, '2026-01-01');
  assert.equal(filter.endDate, '2026-01-31');
  assert.equal(filter.model, 'gpt-4o');
  assert.equal(filter.projectId, 'proj-dash');
  assert.equal(filter.workspaceId, 'ws-dash');
});
