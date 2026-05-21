import { Injectable } from '@nestjs/common';

import type { AgentConversationState } from '../../../../contracts/agent-conversation.js';

@Injectable()
export class ConversationAgentPresenter {
  emptyTextPrompt() {
    return 'Send the note text so I can organize the project and folder before saving.';
  }

  mediaContextPrompt() {
    return 'I received the media. Send the context so I can organize and save it.';
  }

  captureCanceled() {
    return 'Capture canceled. Send a new note whenever you want.';
  }

  noteSaved() {
    return 'Note saved successfully.';
  }

  couldNotUnderstand() {
    return [
      'I could not identify something useful to save yet.',
      'Use this chat to capture notes, decisions, bugs, reminders, summaries, links, or media with context. I will infer the right project and folder, using inbox only when there is not enough context.',
      'Examples: "fixed the webhook timeout" or "remind me tomorrow to review the deploy".',
    ].join('\n');
  }

  needsOneMoreDetail() {
    return 'I need one more detail before saving.';
  }

  finalConfirmationPrompt(state: AgentConversationState, options?: { willCreateProject?: boolean }) {
    const folderText = state.folder.placeInRoot
      ? 'project root'
      : state.folder.selectedFolderId
        ? 'selected existing folder'
        : state.folder.suggestedFolderPath.length
          ? `${state.folder.suggestedFolderPath.join(' / ')} (new, will be created when saved)`
          : 'project root';
    const projectText = options?.willCreateProject
      ? `${state.project.selectedProjectSlug || 'inbox'} (new, will be created when saved)`
      : state.project.selectedProjectSlug || 'inbox';
    return [
      'Note saving summary:',
      `Text: ${state.draft.rawText}`,
      `Project: ${projectText}`,
      `Folder: ${folderText}`,
      `Type: ${state.draft.kind}`,
      `Reminder: ${state.draft.reminderDate ? `${state.draft.reminderDate}${state.draft.reminderTime ? ` ${state.draft.reminderTime}` : ''}` : 'no reminder'}`,
      state.draft.tags.length ? `Tags: ${state.draft.tags.join(', ')}` : '',
    ].filter(Boolean).join('\n');
  }
}
