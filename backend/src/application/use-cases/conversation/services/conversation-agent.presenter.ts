import { Injectable } from '@nestjs/common';

import type { AgentConversationState } from '../../../../contracts/agent-conversation.js';
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
    return 'Capture canceled. Send a new note whenever you want.';
  }

  noteSaved(result: SaveNoteResult) {
    const note = result.note;
    return [
      'Note saved successfully:',
      `Type: ${formatDisplayToken(note.type)}`,
      `Title: ${note.title}`,
      `Project: ${note.projectName}`,
      `Folder: ${note.folderPath}`,
      `Status: ${formatDisplayToken(note.status)}`,
      note.hasReminder ? `Reminder: ${formatReminder(note)}` : '',
      note.attachmentCount > 0 ? `Attachments: ${note.attachmentCount}` : '',
    ].filter(Boolean).join('\n');
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

function formatDisplayToken(value: string | null | undefined) {
  return String(value || '')
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(' ') || 'Not Defined';
}

function formatReminder(note: SaveNoteResult['note']) {
  if (note.reminderAt) {
    const timestamp = Date.parse(note.reminderAt);
    if (Number.isFinite(timestamp)) {
      return formatDateTimeInTimeZone(new Date(timestamp), REMINDER_DISPLAY_TIME_ZONE);
    }
  }
  if (!note.reminderDate) return '';
  const reminderTime = note.reminderTime || '00:00';
  return `${note.reminderDate} ${reminderTime}:00`;
}
