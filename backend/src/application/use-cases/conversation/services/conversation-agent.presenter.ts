import { Injectable } from '@nestjs/common';

import type { AgentConversationState } from '../../../../contracts/agent-conversation.js';
import { formatDisplayToken } from '../../../../domain/strings.js';
import { formatDateTimeInTimeZone } from '../../../../domain/time.js';
import type { SaveNoteResult } from '../../../models/note-save-result.models.js';

const REMINDER_DISPLAY_TIME_ZONE = 'America/Sao_Paulo';

@Injectable()
export class ConversationAgentPresenter {
  emptyTextPrompt() {
    return 'Send the note text so I can organize the project and folder before saving.';
  }

  mediaContextPrompt() {
    return 'I received the media. Send the context so I can organize and save it.';
  }

  captureCanceled() {
    return 'Conversation context cleared successfully. You can start fresh with a new note or command.';
  }

  noteSaved(result: SaveNoteResult, timeZone = REMINDER_DISPLAY_TIME_ZONE) {
    const note = result.note;
    return [
      'Note saved successfully:',
      `Type: ${formatDisplayToken(note.type)}`,
      `Title: ${note.title}`,
      `Project: ${note.projectName}`,
      `Folder: ${note.folderPath}`,
      `Status: ${formatDisplayToken(note.status)}`,
      note.hasReminder ? `Reminder: ${formatReminder(note, timeZone)}` : '',
      note.attachmentCount > 0 ? `Attachments: ${note.attachmentCount}` : '',
    ].filter(Boolean).join('\n');
  }

  couldNotUnderstand() {
    return [
      'I could not identify something useful to save yet.',
      'Use this chat to ask questions about your Kote, capture notes, decisions, bugs, reminders, summaries, links, or media, and reschedule existing reminders.',
      'Examples: "what did we decide about the API?", "fixed the webhook timeout", or "move my deploy reminder to tomorrow".',
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
      `Reminder: ${state.draft.reminderAt || 'no reminder'}`,
      state.draft.tags.length ? `Tags: ${state.draft.tags.join(', ')}` : '',
    ].filter(Boolean).join('\n');
  }
}

function formatReminder(note: SaveNoteResult['note'], timeZone = REMINDER_DISPLAY_TIME_ZONE) {
  if (note.reminderAt) {
    const timestamp = Date.parse(note.reminderAt);
    if (Number.isFinite(timestamp)) {
      return formatDateTimeInTimeZone(new Date(timestamp), timeZone);
    }
  }
  return '';
}
