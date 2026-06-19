export enum WebhookEventStatus {
  Rejected = 'rejected',
  Resolved = 'resolved',
  Ignored = 'ignored',
  Processed = 'processed',
  Failed = 'failed',
}

export enum WebhookEventType {
  Message = 'message',
  Connection = 'connection',
}

export enum WebhookTrigger {
  NoteCreated = 'note.created',
  NoteUpdated = 'note.updated',
  NoteDeleted = 'note.deleted',
}

export enum WebhookIgnoreReason {
  UnsupportedEvent = 'unsupported_event',
  MissingPayload = 'missing_payload',
  FromMe = 'from_me',
  MissingGroupPrefix = 'missing_group_prefix',
}
