import test from 'node:test';
import assert from 'node:assert/strict';

import { createPostgresTestRepositories } from '../helpers/postgres-test-repositories.mjs';

test('PostgresGitCommitRepository reconciles AI session notes with synced commits and supports manual link/unlink', async (t) => {
  const repositories = await createPostgresTestRepositories(t);
  const user = await repositories.createTestUser();
  const workspace = await repositories.contentRepository.upsertWorkspace(user.id, {
    workspaceSlug: 'default',
    displayName: 'Default',
    whatsappChatJid: '',
    telegramChatId: '',
  });
  const project = await repositories.contentRepository.upsertProject(user.id, {
    projectSlug: 'kote',
    displayName: 'Kote',
    workspaceId: workspace.id,
    repositories: [],
    defaultTags: [],
    enabled: true,
    favorite: false,
  });

  // 1. Save an AI session note that created a short SHA via terminal and touched files
  const { note: aiSessionNote } = await repositories.noteLifecycleService.saveNote(user.id, {
    noteInput: {
      projectId: project.id,
      workspaceId: workspace.id,
      projectSlug: 'kote',
      workspaceSlug: 'default',
      path: '20 Inbox/kote/ai-session.md',
      title: 'Implement commit lineage',
      status: 'active',
      tags: ['git'],
      sourceChannel: 'ai-chat',
      source: 'claude-code',
      sessionId: 'session-123',
      occurredAt: '2026-08-25T10:00:00.000Z',
      summary: 'Implemented deterministic git commit links',
      markdown: '# Session transcript',
      links: ['backend/src/git-commit.repository.ts'],
      metadata: {
        changedFiles: ['backend/src/git-commit.repository.ts'],
        gitActivity: {
          branch: 'feat/commit-links',
          createdCommitShas: ['1a2b3c4'],
          touchedFiles: ['backend/src/git-commit.repository.ts'],
        },
      },
    },
  });

  assert.equal(aiSessionNote.linkedCommits?.length, 1);
  assert.equal(aiSessionNote.linkedCommits[0].shortSha, '1a2b3c4');
  assert.equal(aiSessionNote.linkedCommits[0].linkSource, 'ai_terminal');

  // 2. Sync full 40-char commit from GitCommitTracker + a second commit touching the same file
  const syncRes = await repositories.gitCommitRepository.upsertCommitsAndReconcile(
    user.id,
    { workspaceId: workspace.id, projectId: project.id },
    [
      {
        commitSha: '1a2b3c4d5e6f78901a2b3c4d5e6f78901a2b3c4d',
        shortSha: '1a2b3c4',
        message: 'feat: implement commit lineage',
        authorName: 'Pedro Duarte',
        authorEmail: 'pedro@example.com',
        committedAt: '2026-08-25T10:05:00.000Z',
        branch: 'feat/commit-links',
        changedFiles: ['backend/src/git-commit.repository.ts'],
      },
      {
        commitSha: '9988776655443322110099887766554433221100',
        shortSha: '9988776',
        message: 'chore: update readme',
        authorName: 'Pedro Duarte',
        authorEmail: 'pedro@example.com',
        committedAt: '2026-08-25T11:00:00.000Z',
        branch: 'feat/commit-links',
        changedFiles: ['README.md'],
      },
    ],
  );

  assert.equal(syncRes.syncedCount, 2);

  // Verify the short SHA placeholder was upgraded in place to the full 40-char SHA
  const projectCommits = await repositories.gitCommitRepository.listProjectCommits(user.id, {
    workspaceId: workspace.id,
    projectId: project.id,
    page: 1,
    pageSize: 20,
    onlyLinked: false,
  });

  assert.equal(projectCommits.items.length, 2);
  const linkedCommitItem = projectCommits.items.find((c) => c.shortSha === '1a2b3c4');
  assert.ok(linkedCommitItem);
  assert.equal(linkedCommitItem.commitSha, '1a2b3c4d5e6f78901a2b3c4d5e6f78901a2b3c4d');
  assert.equal(linkedCommitItem.linkedNotes.length, 1);
  assert.equal(linkedCommitItem.linkedNotes[0].noteId, aiSessionNote.id);
  assert.equal(linkedCommitItem.linkedNotes[0].linkSource, 'ai_terminal');

  // Verify onlyLinked filter
  const onlyLinkedResult = await repositories.gitCommitRepository.listProjectCommits(user.id, {
    workspaceId: workspace.id,
    projectId: project.id,
    page: 1,
    pageSize: 20,
    onlyLinked: true,
  });
  assert.equal(onlyLinkedResult.items.length, 1);
  assert.equal(onlyLinkedResult.items[0].id, linkedCommitItem.id);

  // Verify filtering with linkFilter: 'ai' vs 'manual'
  const aiFilterResult = await repositories.gitCommitRepository.listProjectCommits(user.id, {
    projectId: project.id,
    page: 1,
    pageSize: 20,
    linkFilter: 'ai',
  });
  assert.equal(aiFilterResult.items.length, 1);
  assert.equal(aiFilterResult.items[0].id, linkedCommitItem.id);

  const manualFilterResult = await repositories.gitCommitRepository.listProjectCommits(user.id, {
    projectId: project.id,
    page: 1,
    pageSize: 20,
    linkFilter: 'manual',
  });
  assert.equal(manualFilterResult.items.length, 0);

  // Verify All Projects query (no projectId) returns projectSlug and projectName
  const allProjectsResult = await repositories.gitCommitRepository.listProjectCommits(user.id, {
    workspaceId: workspace.id,
    page: 1,
    pageSize: 20,
    onlyLinked: false,
  });
  assert.equal(allProjectsResult.items.length, 2);
  assert.equal(allProjectsResult.items[0].projectSlug, 'kote');
  assert.equal(allProjectsResult.items[0].projectName, 'Kote');

  // 3. Test manual linking and unlinking of the second commit
  const unlinkedCommitItem = projectCommits.items.find((c) => c.shortSha === '9988776');
  assert.ok(unlinkedCommitItem);

  const manualLink = await repositories.gitCommitRepository.linkNoteCommitManually(
    user.id,
    aiSessionNote.id,
    unlinkedCommitItem.id,
  );
  assert.equal(manualLink.linkSource, 'manual');
  assert.equal(manualLink.shortSha, '9988776');

  // Verify noteDetail includes both linked commits
  const detail = await repositories.contentQueryRepository.getById(user.id, aiSessionNote.id);
  assert.equal(detail?.linkedCommits?.length, 2);

  // Unlink the manually linked commit
  const removed = await repositories.gitCommitRepository.unlinkNoteCommit(
    user.id,
    aiSessionNote.id,
    unlinkedCommitItem.id,
  );
  assert.equal(removed, true);

  const detailAfterUnlink = await repositories.contentQueryRepository.getById(user.id, aiSessionNote.id);
  assert.equal(detailAfterUnlink?.linkedCommits?.length, 1);

  // 4. Regression test: GitHub push notes with their own headSha must NOT be linked to unrelated commits via session_files,
  // and AI session notes without terminal SHA must only link to the first subsequent commit within 6h of last activity.
  const { note: githubPushNote } = await repositories.noteLifecycleService.saveNote(user.id, {
    noteInput: {
      projectId: project.id,
      workspaceId: workspace.id,
      projectSlug: 'kote',
      workspaceSlug: 'default',
      path: '20 Inbox/kote/github-push.md',
      title: '[Push] kote',
      status: 'active',
      tags: ['code-review', 'push'],
      sourceChannel: 'github',
      source: 'github push',
      sessionId: '',
      occurredAt: '2026-08-20T09:00:00.000Z',
      summary: 'Old GitHub push note',
      markdown: '# Old push',
      links: ['backend/src/shared-service.ts'],
      metadata: {
        repoFullName: 'acme/kote',
        headSha: 'aaaa111122223333444455556666777788889999',
        changedFiles: ['backend/src/shared-service.ts'],
      },
    },
  });

  const { note: workingTreeAiSession } = await repositories.noteLifecycleService.saveNote(user.id, {
    noteInput: {
      projectId: project.id,
      workspaceId: workspace.id,
      projectSlug: 'kote',
      workspaceSlug: 'default',
      path: '20 Inbox/kote/ai-working-tree.md',
      title: 'Refactor shared service',
      status: 'active',
      tags: ['ai'],
      sourceChannel: 'ai-chat',
      source: 'antigravity',
      sessionId: 'session-wt-1',
      occurredAt: '2026-08-26T10:00:00.000Z',
      summary: 'Edited shared-service.ts in IDE',
      markdown: '# Session',
      links: ['backend/src/shared-service.ts'],
      metadata: {
        changedFiles: ['backend/src/shared-service.ts'],
        gitActivity: {
          branch: 'main',
          touchedFiles: ['backend/src/shared-service.ts'],
        },
      },
    },
  });

  // Sync two commits on 2026-08-26 touching backend/src/shared-service.ts:
  // - firstCommit (30m after session) should link to workingTreeAiSession (and NOT to githubPushNote)
  // - secondCommit (2h after session) should NOT re-link to workingTreeAiSession or githubPushNote
  await repositories.gitCommitRepository.upsertCommitsAndReconcile(
    user.id,
    { workspaceId: workspace.id, projectId: project.id },
    [
      {
        commitSha: 'bbbb222233334444555566667777888899990000',
        shortSha: 'bbbb222',
        message: 'feat: first commit after AI session',
        authorName: 'Pedro Duarte',
        authorEmail: 'pedro@example.com',
        committedAt: '2026-08-26T10:30:00.000Z',
        branch: 'main',
        changedFiles: ['backend/src/shared-service.ts'],
      },
      {
        commitSha: 'cccc333344445555666677778888999900001111',
        shortSha: 'cccc333',
        message: 'chore: second commit later on same file',
        authorName: 'Pedro Duarte',
        authorEmail: 'pedro@example.com',
        committedAt: '2026-08-26T12:30:00.000Z',
        branch: 'main',
        changedFiles: ['backend/src/shared-service.ts'],
      },
    ],
  );

  const afterRegressionCommits = await repositories.gitCommitRepository.listProjectCommits(user.id, {
    workspaceId: workspace.id,
    projectId: project.id,
    page: 1,
    pageSize: 20,
    onlyLinked: false,
  });

  const firstCommitAfterSession = afterRegressionCommits.items.find((c) => c.shortSha === 'bbbb222');
  const secondCommitAfterSession = afterRegressionCommits.items.find((c) => c.shortSha === 'cccc333');
  assert.ok(firstCommitAfterSession);
  assert.ok(secondCommitAfterSession);

  // firstCommitAfterSession must ONLY link to workingTreeAiSession (not githubPushNote)
  assert.equal(firstCommitAfterSession.linkedNotes.length, 1);
  assert.equal(firstCommitAfterSession.linkedNotes[0].noteId, workingTreeAiSession.id);
  assert.equal(firstCommitAfterSession.linkedNotes[0].linkSource, 'session_files');

  // secondCommitAfterSession must NOT re-link workingTreeAiSession or githubPushNote
  assert.equal(secondCommitAfterSession.linkedNotes.length, 0);

  // githubPushNote must remain linked only to its own headSha (aaaa111)
  const githubNoteDetail = await repositories.contentQueryRepository.getById(user.id, githubPushNote.id);
  assert.equal(githubNoteDetail?.linkedCommits?.length, 1);
  assert.equal(githubNoteDetail?.linkedCommits?.[0].shortSha, 'aaaa111');
  assert.equal(githubNoteDetail?.linkedCommits?.[0].linkSource, 'github_push');

  // 5. Most-Recent-Owner-Per-File rule: if two AI sessions edit the same file before a commit,
  // only the most recent session before the commit claims that file.
  await repositories.noteLifecycleService.saveNote(user.id, {
    noteInput: {
      projectId: project.id,
      workspaceId: workspace.id,
      projectSlug: 'kote',
      workspaceSlug: 'default',
      path: '20 Inbox/kote/ai-older.md',
      title: 'Older session on hot file',
      status: 'active',
      tags: ['ai'],
      sourceChannel: 'ai-chat',
      source: 'antigravity',
      sessionId: 'session-older-hot',
      occurredAt: '2026-08-27T10:00:00.000Z',
      summary: 'Older edit on hot-file.ts',
      markdown: '# Older',
      metadata: {
        changedFiles: ['frontend/src/hot-file.ts', 'package-lock.json'],
        gitActivity: {
          branch: 'main',
          touchedFiles: ['frontend/src/hot-file.ts', 'package-lock.json'],
        },
      },
    },
  });

  const { note: newerHotSession } = await repositories.noteLifecycleService.saveNote(user.id, {
    noteInput: {
      projectId: project.id,
      workspaceId: workspace.id,
      projectSlug: 'kote',
      workspaceSlug: 'default',
      path: '20 Inbox/kote/ai-newer.md',
      title: 'Newer session on hot file',
      status: 'active',
      tags: ['ai'],
      sourceChannel: 'ai-chat',
      source: 'antigravity',
      sessionId: 'session-newer-hot',
      occurredAt: '2026-08-27T11:00:00.000Z',
      summary: 'Newer edit on hot-file.ts',
      markdown: '# Newer',
      metadata: {
        changedFiles: ['frontend/src/hot-file.ts'],
        gitActivity: {
          branch: 'main',
          touchedFiles: ['frontend/src/hot-file.ts'],
        },
      },
    },
  });

  await repositories.gitCommitRepository.upsertCommitsAndReconcile(
    user.id,
    { workspaceId: workspace.id, projectId: project.id },
    [
      {
        commitSha: 'dddd444455556666777788889999000011112222',
        shortSha: 'dddd444',
        message: 'feat: commit hot file changes',
        authorName: 'Pedro Duarte',
        authorEmail: 'pedro@example.com',
        committedAt: '2026-08-27T11:15:00.000Z',
        branch: 'main',
        changedFiles: ['frontend/src/hot-file.ts', 'package-lock.json'],
      },
    ],
  );

  const afterHotCommits = await repositories.gitCommitRepository.listProjectCommits(user.id, {
    workspaceId: workspace.id,
    projectId: project.id,
    page: 1,
    pageSize: 20,
    onlyLinked: false,
  });

  const hotCommit = afterHotCommits.items.find((c) => c.shortSha === 'dddd444');
  assert.ok(hotCommit);
  assert.equal(hotCommit.linkedNotes.length, 1);
  assert.equal(hotCommit.linkedNotes[0].noteId, newerHotSession.id);
});
