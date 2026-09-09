export type AiSessionSynthesisQueuePayload = { jobId: string };

export abstract class AiSessionSynthesisQueuePublisher {
  /** Resolves only after RabbitMQ confirms durable receipt. */
  abstract publish(job: AiSessionSynthesisQueuePayload): Promise<void>;
}
