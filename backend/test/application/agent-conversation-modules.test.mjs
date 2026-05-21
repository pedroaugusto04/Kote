import test from 'node:test';
import assert from 'node:assert/strict';

import { ProcessAgentConversationUseCase } from '../../dist/application/use-cases/conversation/process-agent-conversation.use-case.js';
import { ConversationAgentPresenter } from '../../dist/application/use-cases/conversation/services/conversation-agent.presenter.js';
import { ConversationFolderResolutionService } from '../../dist/application/use-cases/conversation/services/conversation-folder-resolution.service.js';
import {
  buildNextAgentConversationState,
  emptyAgentConversationState,
} from '../../dist/application/use-cases/conversation/services/conversation-agent-state-machine.js';
import {
  buildConversationAgentSystemPrompt,
  buildConversationAgentTurnPrompt,
} from '../../dist/infrastructure/ai/prompts/conversation-agent.prompt.js';

test('conversation agent prompt prefers organized folders over project root fallback', () => {
  const prompt = buildConversationAgentSystemPrompt();

  assert.match(prompt, /prefer the most sensible existing folder/);
  assert.match(prompt, /suggest a short new folder path/);
  assert.match(prompt, /Use placeInRoot=true only when the user explicitly chooses the project root/);
});

test('conversation agent prompt prioritizes explicit new project requests', () => {
  const prompt = buildConversationAgentSystemPrompt();
  const turnPrompt = buildConversationAgentTurnPrompt({
    messageText: 'crie um projeto novo chamado Projeto X e salve esta nota',
    currentState: {},
    availableProjects: [{ projectSlug: 'platform', displayName: 'Platform', defaultTags: [] }],
    candidateProjectSlug: '',
    candidateFolders: [],
    timeZone: 'UTC',
    currentLocalDate: '2026-05-20',
    currentLocalTime: '12:00',
  });

  assert.match(prompt, /explicitly asks to create\/use a new project/);
  assert.match(prompt, /prefer the new project over existing projects and over "inbox"/);
  assert.match(turnPrompt, /use the requested new project slug instead of falling back to an existing project or inbox/);
});

test('conversation agent presenter formats save summary in English', () => {
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

  assert.match(message, /Note saving summary/);
  assert.match(message, /Runbooks \(new, will be created when saved\)/);
  assert.doesNotMatch(message, /Reply "yes" to save or "no" to discard/);
});

test('conversation agent presenter marks a new project in the save summary', () => {
  const presenter = new ConversationAgentPresenter();
  const state = {
    ...emptyAgentConversationState,
    draft: {
      ...emptyAgentConversationState.draft,
      rawText: 'Registrar decisao',
      kind: 'decision',
      reminderDate: '',
      reminderTime: '',
      tags: [],
    },
    project: { selectedProjectSlug: 'projeto-x' },
    folder: { selectedFolderId: '', suggestedFolderPath: [], placeInRoot: true },
  };

  const message = presenter.finalConfirmationPrompt(state, { willCreateProject: true });

  assert.match(message, /Project: projeto-x \(new, will be created when saved\)/);
});

test('conversation agent presenter explains usage for messages that are not useful to save', () => {
  const presenter = new ConversationAgentPresenter();

  const message = presenter.couldNotUnderstand();

  assert.match(message, /I could not identify something useful to save yet/);
  assert.match(message, /notes, decisions, bugs, reminders, summaries, links, or media/);
  assert.match(message, /infer the right project and folder/);
});

test('conversation agent state machine keeps valid project and prepares submission state', () => {
  const next = buildNextAgentConversationState({
    current: emptyAgentConversationState,
    messageText: 'documented the API deploy checklist',
    media: emptyAgentConversationState.media,
    decision: {
      replyText: 'Ready to save.',
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
      confidence: 'high',
      action: 'confirm',
    },
    projects: [{ projectSlug: 'platform', displayName: 'Platform', workspaceSlug: 'default', repositories: [], defaultTags: [], enabled: true }],
    candidateFolders: [],
    reminderTimeZone: 'UTC',
  });

  assert.equal(next.project.selectedProjectSlug, 'platform');
  assert.deepEqual(next.folder.suggestedFolderPath, ['Runbooks', 'API']);
  assert.deepEqual(next.draft.tags, ['deploy']);
});

test('conversation agent state machine preserves a new project slug for submission state', () => {
  const next = buildNextAgentConversationState({
    current: emptyAgentConversationState,
    messageText: 'anote no projeto x',
    media: emptyAgentConversationState.media,
    decision: {
      replyText: 'Ready to save.',
      resolvedDraft: {
        rawText: 'Anote no projeto x',
        title: '',
        kind: 'note',
        canonicalType: 'event',
        importance: 'medium',
        tags: [],
        reminderDate: '',
        reminderTime: '',
      },
      selectedProjectSlug: 'projeto-x',
      selectedFolderId: '',
      suggestedFolderPath: [],
      placeInRoot: true,
      confidence: 'high',
      action: 'confirm',
    },
    projects: [{ projectSlug: 'platform', displayName: 'Platform', workspaceSlug: 'default', repositories: [], defaultTags: [], enabled: true }],
    candidateFolders: [],
    reminderTimeZone: 'UTC',
  });

  assert.equal(next.project.selectedProjectSlug, 'projeto-x');
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

test('process agent conversation auto-creates a missing project before submitting the note', async () => {
  const savedStates = new Map();
  const createdProjects = [];
  const ingested = [];
  const contentRepository = {
    async listProjects() {
      return [{ projectSlug: 'platform', displayName: 'Platform', workspaceSlug: 'default', repositories: [], defaultTags: [], enabled: true }];
    },
    async getProjectBySlug(_userId, projectSlug) {
      return createdProjects.find((project) => project.projectSlug === projectSlug) || null;
    },
    async upsertProject(_userId, input) {
      createdProjects.push(input);
      return input;
    },
    async listProjectFolders() {
      return [];
    },
  };
  const conversationStates = {
    async get(_userId, _workspaceSlug, key) {
      const state = savedStates.get(key);
      return state ? { state } : null;
    },
    async upsert(_userId, _workspaceSlug, key, state) {
      savedStates.set(key, state);
    },
    async clear(_userId, _workspaceSlug, key) {
      savedStates.delete(key);
    },
  };
  const ingestEntryUseCase = {
    async execute(payload) {
      ingested.push(payload);
      return { ok: true, noteId: 'note-1', project: payload.event.projectSlug, eventPath: '20 Inbox/note.md', attachmentIds: [] };
    },
  };
  const credentials = {
    async findCredential() {
      return { status: 'connected', revokedAt: null };
    },
  };
  const presenter = new ConversationAgentPresenter();
  const useCaseWithDecision = new ProcessAgentConversationUseCase(
    contentRepository,
    conversationStates,
    ingestEntryUseCase,
    {
      read: () => ({
        reminderTimeZone: 'UTC',
        conversationAiProvider: 'openrouter',
        conversationAiBaseUrl: 'https://example.com',
        conversationAiModel: 'test-model',
        conversationAiApiKey: 'test-key',
      }),
    },
    {
      async decide() {
        return {
          replyText: 'Ready to save.',
          resolvedDraft: {
            rawText: 'Fiz algo no projeto x',
            title: '',
            kind: 'note',
            canonicalType: 'event',
            importance: 'medium',
            tags: [],
            reminderDate: '',
            reminderTime: '',
          },
          selectedProjectSlug: 'projeto-x',
          selectedFolderId: '',
          suggestedFolderPath: [],
          placeInRoot: true,
          confidence: 'high',
          action: 'confirm',
        };
      },
    },
    presenter,
    {
      async resolveFolderIdForSubmission() {
        return '';
      },
    },
    credentials,
  );

  const result = await useCaseWithDecision.execute({
    messageText: 'Fiz algo no projeto x',
    senderId: '5511999999999@s.whatsapp.net',
    chatId: 'group@g.us',
    messageId: 'msg-1',
    hasMedia: false,
    media: {},
  }, 'user-1', 'default');

  assert.equal(result.action, 'submit');
  assert.equal(createdProjects.length, 1);
  assert.deepEqual(createdProjects[0], {
    projectSlug: 'projeto-x',
    displayName: 'Projeto X',
    workspaceSlug: 'default',
    repositories: [],
    defaultTags: [],
    enabled: true,
  });
  assert.equal(ingested.length, 1);
  assert.equal(ingested[0].event.projectSlug, 'projeto-x');
});
