import type { NoteEventPayload } from '../../../domain/note-event.js';

/**
 * Webhook queue publisher port.
 *
 * Use cases publish webhook jobs after note mutations.
 * A dedicated worker consumes these jobs and delivers
 * the HTTP requests to registered subscription endpoints.
 */
export abstract class WebhookQueuePublisher {
  abstract publish(payload: NoteEventPayload): Promise<void>;
}
