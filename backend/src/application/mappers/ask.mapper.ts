import type { AskConversationTurn } from '../../contracts/ask-conversation.js';
import type { AskHistoryItem, SaveAskHistoryInput } from '../models/ask-history.models.js';
import type { AskKnowledgeResult } from '../use-cases/query/ask-knowledge.use-case.js';
import type { NoteRecord, AttachmentRecord, SaveProjectInput } from '../models/repository-records.models.js';
import type { AnswerContextChunk } from '../ports/query/answer-generation.gateway.js';
import type { ReminderView } from '../models/reminder.models.js';

export function toAskConversationTurns(turns: AskHistoryItem[]): AskConversationTurn[] {
  return turns.map((t) => ({
    question: t.question,
    answer: t.answer,
    projectSlug: '',
    timestamp: t.createdAt,
  }));
}

export function toSaveAskHistoryInput(params: {
  userId: string;
  projectId: string | null;
  workspaceId: string | null;
  conversationId: string;
  question: string;
  result: AskKnowledgeResult;
}): SaveAskHistoryInput {
  return {
    userId: params.userId,
    projectId: params.projectId,
    workspaceId: params.workspaceId,
    conversationId: params.conversationId,
    question: params.question,
    answer: params.result.answer,
    confidence: params.result.confidence,
    sources: params.result.sources,
    relatedNotes: params.result.relatedNotes,
  };
}

export function toAskChunkItems(contextChunks: AnswerContextChunk[]) {
  return contextChunks.map((c) => ({
    noteId: c.noteId,
    title: c.title,
    path: c.path,
    project: c.projectSlug,
    text: c.chunkText,
  }));
}

export function toAskNoteContentResult(note: NoteRecord, content: string) {
  return {
    id: note.id,
    title: note.title,
    path: note.path,
    projectSlug: note.projectSlug,
    tags: note.tags,
    content,
  };
}

export function toAskProjectsResult(projects: SaveProjectInput[]) {
  return projects.map((p) => ({
    id: p.id,
    name: p.displayName,
    slug: p.projectSlug,
    defaultTags: p.defaultTags || [],
  }));
}

export function toAskRecentNotesResult(notes: NoteRecord[]) {
  return notes.map((n) => ({
    id: n.id,
    title: n.title,
    path: n.path,
    projectSlug: n.projectSlug,
    occurredAt: n.occurredAt,
  }));
}

export function toAskRemindersResult(reminders: ReminderView[]) {
  return reminders.map((r) => ({
    id: r.id,
    title: r.title,
    project: r.project,
    status: r.status,
    isOverdue: r.isOverdue,
    reminderAt: r.reminderAt,
    noteText: r.noteText,
  }));
}

export function toAskAttachmentsResult(attachments: AttachmentRecord[]) {
  return attachments.map((a) => ({
    id: a.id,
    fileName: a.fileName,
    sizeBytes: a.sizeBytes,
    mimeType: a.mimeType,
    createdAt: a.createdAt,
  }));
}
