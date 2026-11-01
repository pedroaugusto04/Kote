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
});
