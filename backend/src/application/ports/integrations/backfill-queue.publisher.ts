export type BackfillJobMessagePayload = {
  jobId: string;
};

/** Abstract publisher port so the application layer doesn't depend on infrastructure. */
export abstract class BackfillQueuePublisher {
  abstract publish(message: BackfillJobMessagePayload): Promise<void>;
}
