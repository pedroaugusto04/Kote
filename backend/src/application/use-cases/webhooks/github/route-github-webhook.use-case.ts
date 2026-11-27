import { Injectable } from '@nestjs/common';
import { AppLogger } from '../../../../observability/logger.js';
import { HandleGithubPushUseCase } from './handle-github-push.use-case.js';
import { HandleGithubPullRequestUseCase } from './handle-github-pull-request.use-case.js';

export type RouteGithubWebhookInput = {
  headers: Record<string, string | string[] | undefined>;
  body: Record<string, unknown> & {
    repository?: { id?: string | number; full_name?: string };
    ref?: string;
    before?: string;
    after?: string;
  };
  rawBodyBuffer?: Buffer;
};

@Injectable()
export class RouteGithubWebhookUseCase {
  constructor(
    private readonly githubPush: HandleGithubPushUseCase,
    private readonly githubPr: HandleGithubPullRequestUseCase,
    private readonly logger: AppLogger,
  ) {}

  execute(input: RouteGithubWebhookInput) {
    const eventType = String(input.headers['x-github-event'] || 'push').trim().toLowerCase();
    this.logger.info('github_webhook_received', {
      eventType,
      repositoryId: input.body.repository?.id,
      repositoryFullName: input.body.repository?.full_name,
      ref: input.body.ref,
      before: input.body.before,
      after: input.body.after,
    });

    const rawBody = input.rawBodyBuffer?.toString('utf8') || JSON.stringify(input.body || {});
    const webhookRequest = {
      headers: input.headers,
      body: input.body,
      rawBody,
    };

    if (eventType === 'pull_request') {
      return this.githubPr.execute(webhookRequest);
    }
    return this.githubPush.execute(webhookRequest);
  }
}
