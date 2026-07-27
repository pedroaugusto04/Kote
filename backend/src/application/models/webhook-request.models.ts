export type WebhookRequestHeaders = Record<string, string | string[] | undefined>;

export type GithubPushWebhookRequest = {
  headers?: WebhookRequestHeaders;
  body: Record<string, unknown>;
  rawBody?: string;
};

export type GithubPullRequestWebhookRequest = {
  headers?: WebhookRequestHeaders;
  body: Record<string, unknown>;
  rawBody?: string;
};

export type WhatsappWebhookRequest = {
  headers?: WebhookRequestHeaders;
  body: Record<string, unknown>;
};

export type TelegramWebhookRequest = {
  headers?: WebhookRequestHeaders;
  body: Record<string, unknown>;
};
