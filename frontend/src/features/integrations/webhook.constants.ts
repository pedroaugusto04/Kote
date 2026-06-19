export const WEBHOOK_MESSAGES = {
  FORM: {
    EDIT_TITLE: 'Edit webhook',
    NEW_TITLE: 'New webhook',
    LABEL: 'Label',
    ENDPOINT_URL: 'Endpoint URL',
    SECRET_NEW: 'New secret (leave blank to keep)',
    SECRET_CREATE: 'Secret (HMAC SHA-256, optional)',
    EVENTS: 'Events',
    SAVE: 'Save',
    CREATE: 'Create',
  },
  
  VALIDATION: {
    LABEL_REQUIRED: 'Label is required.',
    URL_INVALID: 'Enter a valid URL.',
    EVENTS_REQUIRED: 'Select at least one event.',
  },
  
  CARD: {
    TITLE: 'Webhooks',
    DESCRIPTION: 'Notify external endpoints when notes are created, updated or deleted.',
    LOADING: 'Loading webhooks...',
    ERROR: 'Could not load webhooks.',
    EMPTY: 'No webhooks configured yet.',
    COUNT: '{count} webhook{plural}',
    NEW_BUTTON: '+ New webhook',
  },
  
  MUTATION: {
    CREATED: 'Webhook created.',
    UPDATED: 'Webhook updated.',
    DELETED: 'Webhook deleted.',
    ERROR: 'Could not save the webhook.',
  },
  
  ROW: {
    ACTIVE: 'active',
    DISABLED: 'disabled',
    ENABLE: 'Enable',
    DISABLE: 'Disable',
    EDIT: 'Edit',
    DELETE: 'Delete',
  },
  
  DELETE_CONFIRMATION: {
    TITLE: 'Delete webhook',
    CANCEL: 'Cancel',
    CONFIRM: 'Delete',
    DESCRIPTION: 'Delete webhook "{label}"? This cannot be undone.',
  },
  
  CLOSE: 'Close',
} as const;
