export enum IntegrationProvider {
  GithubApp = 'github-app',
  Whatsapp = 'whatsapp',
  Telegram = 'telegram',
  PushNotifications = 'push-notifications',
  PrContextAi = 'pr-context-ai',
  FileNotesSummaryAi = 'file-notes-summary-ai',
}

export const INTEGRATION_LOGOS: Record<string, { src: string; label: string }> = {
  [IntegrationProvider.GithubApp]: { src: 'https://cdn.simpleicons.org/github/ffffff', label: 'GitHub' },
  [IntegrationProvider.Whatsapp]: { src: 'https://cdn.simpleicons.org/whatsapp/25D366', label: 'WhatsApp' },
  [IntegrationProvider.Telegram]: { src: 'https://cdn.simpleicons.org/telegram/26A5E4', label: 'Telegram' },
  [IntegrationProvider.PushNotifications]: { src: 'https://cdn.simpleicons.org/pushover/3B5998', label: 'Push Notifications' },
  [IntegrationProvider.PrContextAi]: { src: 'https://cdn.simpleicons.org/github/0052CC', label: 'PR Context AI' },
  [IntegrationProvider.FileNotesSummaryAi]: { src: 'https://cdn.simpleicons.org/openai/412991', label: 'File Notes Summary AI' },
};

export const INTEGRATION_MESSAGES = {
  WHATSAPP_NUMBER: import.meta.env.VITE_WHATSAPP_NUMBER || '5531992504889',
  TELEGRAM_BOT_USERNAME: import.meta.env.VITE_TELEGRAM_BOT_USERNAME || 'kb_notes_bot',
  
  WHATSAPP_BASE_URL: 'https://wa.me/',
  TELEGRAM_BASE_URL: 'https://t.me/',
  
  DEFAULT_STEP: 'Start the connection to enable this integration.',
  
  PROVIDER_LABELS: {
    [IntegrationProvider.Telegram]: 'Telegram',
    [IntegrationProvider.Whatsapp]: 'WhatsApp',
  },
  
  CONNECTION: {
    TITLE: 'Connect {provider}',
    WHATSAPP_INSTRUCTION: 'Send the command below to the Kote WhatsApp bot:',
    TELEGRAM_INSTRUCTION: 'Send the command below to the Kote Telegram bot:',
    CONNECTION_CODE: 'Connection code',
    SEND_TO_WHATSAPP: 'Send {instruction} to +{number}',
    SEND_TO_TELEGRAM: 'Send {instruction} to @{username}',
    OPEN_WHATSAPP: 'Open WhatsApp',
    OPEN_TELEGRAM_BOT: 'Open Telegram bot',
    COPY_COMMAND: 'Copy command',
    CONNECTED_AS: 'Connected as {account}',
  },
  
  GITHUB_REPOSITORIES: {
    TITLE: 'Select repositories',
    LOADING: 'Loading repositories...',
    ERROR: 'Could not load repositories.',
    SELECTED: '{count} selected',
    SAVE: 'Save',
    SUCCESS: 'Repositories saved successfully.',
    ERROR_SAVE: 'Could not save the selected repositories.',
    VALIDATION_REQUIRED: 'Select a valid repository.',
    VALIDATION_MAX: 'Select at most 100 repositories.',
    REPOSITORIES_BUTTON: 'Repositories',
    SUCCESS_INSTRUCTION: "You're all set! Just push to any allowed repository, and Kote will automatically create a note containing the commit details along with an AI-generated review.",
    REPOSITORY_LIST_ARIA: 'GitHub repository list',
  },

  GITHUB_BACKFILL: {
    TITLE: 'Import recent commit history?',
    DESCRIPTION: 'We can analyze your last {limit} commits and create AI code review notes.',
    IMPORT: 'Import {limit} commits',
    SKIP: 'Not now',
    STARTED: 'Import started. Reviews will appear on your timeline shortly.',
    ERROR: 'Could not start the GitHub import.',
    QUOTA_EXCEEDED: 'AI credit limit reached before the import finished.',
    CANCEL_TITLE: 'Cancel Import',
    CANCEL_DESCRIPTION: 'Are you sure you want to cancel the import of recent commits?',
    CANCEL_CONFIRM: 'Yes, cancel',
    CANCEL_KEEP: 'No, keep importing',
    CANCEL_SUCCESS: 'Import cancelled successfully.',
    CANCEL_ERROR: 'Could not cancel the import.',
  },
  
  PUSH_NOTIFICATIONS: {
    BROWSER_NOT_SUPPORTED: 'Navegador não suporta notificações Push.',
    PERMISSION_DENIED: 'Permissão para notificações foi negada.',
    VAPID_KEY_NOT_CONFIGURED: 'Chave pública VAPID não configurada no servidor.',
    SUCCESS: 'Notificações Push ativadas com sucesso.',
    DEACTIVATED: '{name} desativado com sucesso.',
  },
  
  GENERAL: {
    ACTIVATE_ERROR: 'Could not activate this integration.',
    REVOKE_ERROR: 'Could not revoke this integration.',
    UPDATED_SUCCESS: '{name} updated successfully.',
    CREATE_WORKSPACE_REQUIRED: 'Create a workspace to continue.',
    LOADING: 'Loading integrations...',
    LOAD_ERROR: 'Could not load integration status.',
    REVOKE: 'Revoke',
    CONNECT: 'Connect',
    ACCOUNT_LABEL: 'Account: {account}',
  },
} as const;
