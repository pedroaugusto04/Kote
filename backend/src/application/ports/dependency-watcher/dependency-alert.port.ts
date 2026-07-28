import type { AiProvider, DependencyUrgency } from '../../../contracts/enums.js';

export type DependencyAlertConfig = {
  provider: AiProvider;
  baseUrl?: string;
  model: string;
  apiKey: string;
};

export type DependencyAlertPayload = {
  packageName: string;
  currentVersion: string;
  latestVersion: string;
  changelog?: string;
  ecosystem: string;
};

export type DependencyAlertResult = {
  urgency: DependencyUrgency;
  summary: string;
  breakingChanges: string[];
  nextSteps: string[];
};

export abstract class DependencyAlertGateway {
  abstract analyze(config: DependencyAlertConfig, payload: DependencyAlertPayload): Promise<DependencyAlertResult>;
}
