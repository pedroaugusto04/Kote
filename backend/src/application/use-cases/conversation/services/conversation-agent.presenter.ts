import { Injectable } from '@nestjs/common';

import type { AgentConversationState } from '../../../../contracts/agent-conversation.js';
import type { ProjectRecord } from '../../../models/repository-records.models.js';

@Injectable()
export class ConversationAgentPresenter {
  emptyTextPrompt() {
    return 'Send the note text so I can organize the project and folder before saving.';
  }

  mediaContextPrompt() {
    return 'I received the media. Tell me what it is and which project I should save it to.';
  }

  captureCanceled() {
    return 'Capture canceled. Send a new note whenever you want.';
  }

  noteDiscarded() {
    return 'Note discarded. No record was created.';
  }

  noteSaved() {
    return 'Note saved successfully.';
  }

  couldNotUnderstand() {
    return [
      'I could not identify something useful to save yet.',
      'Use this chat to capture notes, decisions, bugs, reminders, summaries, links, or media with context. I will organize the content into the right project and folder, then ask for confirmation before saving.',
      'Examples: "save to project platform: fixed the webhook timeout" or "remind me tomorrow to review the deploy".',
    ].join('\n');
  }

  needsOneMoreDetail() {
    return 'I need one more detail before saving.';
  }

  projectPrompt(replyText: string, projects: ProjectRecord[]) {
    const options = ['inbox', ...projects.map((project) => `${project.projectSlug} (${project.displayName})`)];
    return `${replyText || 'Which project should I use for this note?'}\n\nAvailable projects: ${options.join(', ')}`;
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
      'Confirm note saving:',
      `Text: ${state.draft.rawText}`,
      `Project: ${projectText}`,
      `Folder: ${folderText}`,
      `Type: ${state.draft.kind}`,
      `Reminder: ${state.draft.reminderDate ? `${state.draft.reminderDate}${state.draft.reminderTime ? ` ${state.draft.reminderTime}` : ''}` : 'no reminder'}`,
      state.draft.tags.length ? `Tags: ${state.draft.tags.join(', ')}` : '',
      '',
      'Reply "yes" to save or "no" to discard.',
    ].filter(Boolean).join('\n');
  }
}
