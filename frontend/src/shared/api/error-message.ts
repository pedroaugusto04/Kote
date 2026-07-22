import { ApiClientError } from './models/error';

export function getErrorMessage(error: unknown, fallbackMessage: string): string {
  if (error instanceof ApiClientError) {
    if (error.code.toLowerCase() === 'quota_exceeded') {
      return 'Your AI credits are exhausted. They reset at the start of the next billing period.';
    }
    if (error.code === 'project_brief_ai_not_connected') {
      return 'Project Brief AI is not enabled for this workspace. Enable it in Automations to generate a brief.';
    }
    if (error.code === 'ai_conversation_not_enabled') {
      return 'Conversation AI is not enabled for this workspace.';
    }
    if (error.code.endsWith('_ai_not_configured')) {
      return formatAiConfigurationError(error, aiLabel(error.code));
    }
    if (error.message.trim()) return error.message;
  }
  return fallbackMessage;
}

function aiLabel(code: string): string {
  const labels: Record<string, string> = {
    review_ai_not_configured: 'Review AI',
    conversation_ai_not_configured: 'Conversation AI',
    project_brief_ai_not_configured: 'Project Brief AI',
    pr_context_ai_not_configured: 'PR Context AI',
    file_notes_summary_ai_not_configured: 'File Notes Summary AI',
  };
  return labels[code] || 'AI';
}

function formatAiConfigurationError(error: ApiClientError, label: string): string {
  const missing = Array.isArray(error.details.missing)
    ? error.details.missing.filter((value): value is string => typeof value === 'string')
    : [];
  if (missing.length === 0) return `${label} is not configured on the server.`;

  const labels: Record<string, string> = {
    provider: 'provider',
    baseUrl: 'base URL',
    model: 'model',
    apiKey: 'API key',
  };
  return `${label} is not configured on the server. Missing: ${missing.map((value) => labels[value] || value).join(', ')}.`;
}
