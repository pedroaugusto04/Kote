import { WebhookTrigger } from '../contracts/enums.js';

export type WebhookTriggerDefinition = {
  trigger: WebhookTrigger;
  group: string;
  label: string;
  description: string;
};

export const WEBHOOK_TRIGGER_REGISTRY: readonly WebhookTriggerDefinition[] = [
  {
    trigger: WebhookTrigger.NoteCreated,
    group: 'notes',
    label: 'Note created',
    description: 'Fired when a new note is created manually or via ingest.',
  },
  {
    trigger: WebhookTrigger.NoteUpdated,
    group: 'notes',
    label: 'Note updated',
    description: 'Fired when an existing note is edited.',
  },
  {
    trigger: WebhookTrigger.NoteDeleted,
    group: 'notes',
    label: 'Note deleted',
    description: 'Fired when a note is permanently deleted.',
  },
] as const;

export function triggersByGroup(): Record<string, WebhookTriggerDefinition[]> {
  const groups: Record<string, WebhookTriggerDefinition[]> = {};
  for (const def of WEBHOOK_TRIGGER_REGISTRY) {
    (groups[def.group] ??= []).push(def);
  }
  return groups;
}

export function assertRegistryComplete(): void {
  const registered = new Set(WEBHOOK_TRIGGER_REGISTRY.map((d) => d.trigger));
  for (const value of Object.values(WebhookTrigger)) {
    if (!registered.has(value)) {
      throw new Error(`WebhookTrigger.${value} is missing from WEBHOOK_TRIGGER_REGISTRY`);
    }
  }
}
