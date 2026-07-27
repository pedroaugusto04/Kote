export type WeeklySummaryJobMessage = {
  userId: string;
  startIso: string;
  endIso: string;
};

export abstract class WeeklySummaryQueuePublisher {
  abstract publishWeeklySummaryJob(message: WeeklySummaryJobMessage): Promise<void>;
}
