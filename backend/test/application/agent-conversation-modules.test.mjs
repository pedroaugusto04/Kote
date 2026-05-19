import test from 'node:test';
import assert from 'node:assert/strict';

import { ConversationAgentPresenter } from '../../dist/application/use-cases/conversation/services/conversation-agent.presenter.js';
import { ConversationFolderResolutionService } from '../../dist/application/use-cases/conversation/services/conversation-folder-resolution.service.js';
import {
  buildNextAgentConversationState,
  emptyAgentConversationState,
  parseApprovalIntent,
} from '../../dist/application/use-cases/conversation/services/conversation-agent-state-machine.js';

test('conversation agent presenter formats final confirmation in English', () => {
  const presenter = new ConversationAgentPresenter();
  const state = {
    ...emptyAgentConversationState,
    draft: {
      ...emptyAgentConversationState.draft,
      rawText: 'Document the deploy checklist',
      kind: 'summary',
      reminderDate: '',
      reminderTime: '',
      tags: ['deploy'],
    },
    project: { selectedProjectSlug: 'platform' },
    folder: { selectedFolderId: '', suggestedFolderPath: ['Runbooks'], placeInRoot: false },
  };

  const message = presenter.finalConfirmationPrompt(state);

  assert.match(message, /Confirm note saving/);
  assert.match(message, /Runbooks \(new, will be created when saved\)/);
  assert.match(message, /Reply "yes" to save or "no" to discard/);
});

test('conversation agent state machine keeps valid project and prepares final confirmation', () => {
  const next = buildNextAgentConversationState({
    current: emptyAgentConversationState,
    messageText: 'documented the API deploy checklist',
    media: emptyAgentConversationState.media,
    decision: {
      replyText: 'Confirm note saving.',
      resolvedDraft: {
        rawText: 'Documented the API deploy checklist',
        title: '',
        kind: 'summary',
        canonicalType: 'knowledge',
        importance: 'medium',
        tags: ['Deploy'],
        reminderDate: '',
        reminderTime: '',
      },
      selectedProjectSlug: 'platform',
      selectedFolderId: '',
      suggestedFolderPath: ['Runbooks', 'API'],
      placeInRoot: false,
      pendingApproval: 'final_confirmation',
      approvalIntent: 'none',
      confidence: 'high',
      action: 'confirm',
    },
    projects: [{ projectSlug: 'platform', displayName: 'Platform', workspaceSlug: 'default', repositories: [], defaultTags: [], enabled: true }],
    candidateFolders: [],
    reminderTimeZone: 'UTC',
  });

  assert.equal(next.pendingApproval, 'final_confirmation');
  assert.equal(next.project.selectedProjectSlug, 'platform');
  assert.deepEqual(next.folder.suggestedFolderPath, ['Runbooks', 'API']);
  assert.deepEqual(next.draft.tags, ['deploy']);
});

test('conversation folder resolution creates missing nested folders in order', async () => {
  const folders = [];
  const contentRepository = {
    async listProjectFolders() {
      return folders;
    },
  };
  const createProjectFolderUseCase = {
    async execute(input) {
      const parent = input.parentFolderId ? folders.find((folder) => folder.id === input.parentFolderId) : null;
      const folderSlug = input.displayName.toLowerCase();
      const folder = {
        id: `folder-${folders.length + 1}`,
        parentFolderId: input.parentFolderId || null,
        folderSlug,
        fullSlugPath: parent ? `${parent.fullSlugPath}/${folderSlug}` : folderSlug,
      };
      folders.push(folder);
      return { folder };
    },
  };
  const service = new ConversationFolderResolutionService(contentRepository, createProjectFolderUseCase);
  const state = {
    ...emptyAgentConversationState,
    project: { selectedProjectSlug: 'platform' },
    folder: { selectedFolderId: '', suggestedFolderPath: ['Runbooks', 'API'], placeInRoot: false },
  };

  const folderId = await service.resolveFolderIdForSubmission('user-1', state);

  assert.equal(folderId, 'folder-2');
  assert.deepEqual(folders.map((folder) => folder.fullSlugPath), ['runbooks', 'runbooks/api']);
});

test('conversation approval parser accepts English and legacy Portuguese commands', () => {
  assert.equal(parseApprovalIntent('yes'), 'approve');
  assert.equal(parseApprovalIntent('sim'), 'approve');
  assert.equal(parseApprovalIntent('no'), 'reject');
  assert.equal(parseApprovalIntent('cancel'), 'cancel');
});
