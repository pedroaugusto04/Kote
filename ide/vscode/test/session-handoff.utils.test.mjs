import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const {
  CLOUD_SESSION_BADGE,
  isAiSessionNote,
  formatProviderDisplayName,
  buildHandoffQuickPickItems,
  buildUnifiedSessionQuickPickItems,
  resolveHandoffSessionPayload,
  pickBestCandidateSession,
} = require('../out/ai-history/handoff/session-handoff.utils.js');

test('isAiSessionNote correctly identifies AI session notes vs regular notes', () => {
  assert.equal(isAiSessionNote({ id: '1', title: 'Chat Note', sourceChannel: 'ai-chat' }), true);
  assert.equal(isAiSessionNote({ id: '2', title: 'Chat Note', source: 'ai-chat' }), true);
  assert.equal(isAiSessionNote({ id: '3', title: 'Session Note', sessionId: 'sess-123' }), true);
  assert.equal(isAiSessionNote({ id: '4', title: 'Antigravity Session', source: 'antigravity' }), true);
  assert.equal(isAiSessionNote({ id: '5', title: 'Claude Session', source: 'claude-code' }), true);

  // Non-AI notes
  assert.equal(isAiSessionNote({ id: '6', title: 'Manual Note', sourceChannel: 'web' }), false);
  assert.equal(isAiSessionNote({ id: '7', title: 'Todo Note' }), false);
  assert.equal(isAiSessionNote({ id: '8', title: 'Git Note', sourceChannel: 'github' }), false);
});

test('formatProviderDisplayName formats known and registered providers', () => {
  const providersMap = new Map([
    ['custom-provider', { id: 'custom-provider', name: 'Custom Harness' }],
  ]);

  assert.equal(formatProviderDisplayName('custom-provider', providersMap), 'Custom Harness');
  assert.equal(formatProviderDisplayName('claude-code'), 'Claude Code');
  assert.equal(formatProviderDisplayName('antigravity'), 'Antigravity');
  assert.equal(formatProviderDisplayName('open-code'), 'OpenCode');
  assert.equal(formatProviderDisplayName('codex-cli'), 'Codex CLI');
  assert.equal(formatProviderDisplayName(undefined), 'AI Session');
});

test('buildHandoffQuickPickItems builds unified, deduplicated and sorted list with [Cloud] badge', () => {
  const providersMap = new Map([
    ['claude-code', { id: 'claude-code', name: 'Claude Code' }],
    ['antigravity', { id: 'antigravity', name: 'Antigravity' }],
  ]);

  const localSessions = [
    {
      sessionId: 'sess-local-1',
      providerId: 'claude-code',
      title: 'Local Claude Session',
      timestamp: 1000,
      turns: [{ role: 'user', content: 'Hi' }],
      projectSlug: 'proj-a',
    },
    {
      sessionId: 'sess-empty',
      providerId: 'claude-code',
      title: 'Empty session without turns',
      timestamp: 900,
      turns: [],
      projectSlug: 'proj-a',
    },
  ];

  const cloudNotes = [
    // Duplicate of local session (should be excluded in favor of local)
    {
      id: 'note-1',
      sessionId: 'sess-local-1',
      title: 'Local Claude Session in Cloud',
      sourceChannel: 'ai-chat',
      source: 'claude-code',
      createdAt: new Date(1000).toISOString(),
    },
    // Remote-only session from another PC (should be included with [Cloud] badge)
    {
      id: 'note-2',
      sessionId: 'sess-remote-other-pc',
      title: 'Remote Antigravity Session',
      sourceChannel: 'ai-chat',
      source: 'antigravity',
      createdAt: new Date(2000).toISOString(),
    },
    // Regular non-AI note (should be ignored)
    {
      id: 'note-3',
      title: 'Meeting Notes',
      createdAt: new Date(3000).toISOString(),
    },
  ];

  const items = buildHandoffQuickPickItems(localSessions, cloudNotes, providersMap);

  // Expected 2 items: 1 remote session (t=2000) and 1 local session (t=1000)
  assert.equal(items.length, 2);

  // Check sorting (newest first)
  assert.equal(items[0].label, 'Remote Antigravity Session');
  assert.equal(items[0].description, `${CLOUD_SESSION_BADGE} Antigravity`);
  assert.equal(items[0].target.kind, 'cloud');

  assert.equal(items[1].label, 'Local Claude Session');
  assert.equal(items[1].description, 'Claude Code');
  assert.equal(items[1].target.kind, 'local');
});

test('resolveHandoffSessionPayload constructs payload for local and cloud sessions without duplicating logic', () => {
  const localSession = {
    sessionId: 'sess-1',
    providerId: 'claude-code',
    title: 'Local Session',
    timestamp: 1234,
    turns: [],
    projectSlug: 'my-project',
  };

  const localResolved = resolveHandoffSessionPayload(localSession, (s) => `# ${s.title}`);
  assert.equal(localResolved.title, 'Local Session');
  assert.equal(localResolved.providerId, 'claude-code');
  assert.equal(localResolved.projectSlug, 'my-project');
  assert.equal(localResolved.payload.rawText, '# Local Session');
  assert.equal(localResolved.payload.noteId, undefined);

  const cloudSession = {
    noteId: 'note-uuid-999',
    providerId: 'antigravity',
    title: 'Cloud Session From Other PC',
    projectSlug: 'other-project',
    timestamp: '2026-10-25T20:00:00Z',
  };

  const cloudResolved = resolveHandoffSessionPayload(cloudSession, () => 'should-not-be-called');
  assert.equal(cloudResolved.title, 'Cloud Session From Other PC');
  assert.equal(cloudResolved.providerId, 'antigravity');
  assert.equal(cloudResolved.projectSlug, 'other-project');
  assert.equal(cloudResolved.payload.noteId, 'note-uuid-999');
  assert.equal(cloudResolved.payload.rawText, undefined);
});

test('pickBestCandidateSession correctly chooses between local and cloud candidates', () => {
  const localSession = {
    sessionId: 'sess-local-10',
    providerId: 'claude-code',
    title: 'Local Candidate',
    timestamp: 1000,
    turns: [],
  };

  const cloudNewer = {
    noteId: 'cloud-note-1',
    providerId: 'antigravity',
    title: 'Cloud Candidate Newer',
    timestamp: 2000,
  };

  const cloudOlder = {
    noteId: 'cloud-note-2',
    providerId: 'antigravity',
    title: 'Cloud Candidate Older',
    timestamp: 500,
  };

  // Only one candidate available
  assert.equal(pickBestCandidateSession(localSession, null), localSession);
  assert.equal(pickBestCandidateSession(null, cloudNewer), cloudNewer);
  assert.equal(pickBestCandidateSession(null, null), null);

  // Newer cloud candidate wins
  assert.equal(pickBestCandidateSession(localSession, cloudNewer), cloudNewer);

  // Newer local candidate wins
  assert.equal(pickBestCandidateSession(localSession, cloudOlder), localSession);

  // If local and cloud refer to the exact same session, favor local (contains full turns)
  const cloudIdentical = {
    noteId: 'cloud-note-dup',
    sessionId: 'sess-local-10',
    providerId: 'claude-code',
    title: 'Synced from local',
    timestamp: 3000,
  };
  assert.equal(pickBestCandidateSession(localSession, cloudIdentical), localSession);
});

test('buildUnifiedSessionQuickPickItems builds unified session browser list with [Cloud] badge', () => {
  const providersMap = new Map([
    ['claude-code', { id: 'claude-code', name: 'Claude Code' }],
    ['antigravity', { id: 'antigravity', name: 'Antigravity' }],
  ]);

  const localSessions = [
    {
      sessionId: 'sess-local-browser',
      providerId: 'claude-code',
      title: 'Local Code Session',
      timestamp: 1500,
      turns: [{ role: 'user', content: 'hello' }],
      tokenUsage: { totalTokens: 1200 },
    },
  ];

  const cloudNotes = [
    {
      id: 'cloud-1',
      sessionId: 'sess-remote-browser',
      title: 'Cloud Remote Session',
      sourceChannel: 'ai-chat',
      source: 'antigravity',
      createdAt: new Date(2500).toISOString(),
    },
    {
      id: 'cloud-dup',
      sessionId: 'sess-local-browser',
      title: 'Duplicate Note in Cloud',
      sourceChannel: 'ai-chat',
      source: 'claude-code',
      createdAt: new Date(1500).toISOString(),
    },
  ];

  const items = buildUnifiedSessionQuickPickItems(localSessions, cloudNotes, providersMap);

  assert.equal(items.length, 2);
  assert.equal(items[0].label, 'Cloud Remote Session');
  assert.equal(items[0].description, `${CLOUD_SESSION_BADGE} Antigravity`);
  assert.equal(items[0].target.kind, 'cloud');

  assert.equal(items[1].label, 'Local Code Session');
  assert.equal(items[1].description, 'Claude Code');
  assert.equal(items[1].target.kind, 'local');
  assert.match(items[1].detail, /1 turn\(s\)/);
  assert.match(items[1].detail, /1,200 tok/);
});
