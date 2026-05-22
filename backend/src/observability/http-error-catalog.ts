import { HttpStatus } from '@nestjs/common';

export type HttpErrorLogLevel = 'debug' | 'info' | 'warn' | 'error';

type HttpErrorDefinition = {
  statusCode: number;
  safeMessage: string;
  logLevel: HttpErrorLogLevel;
};

export const httpErrorCatalog = {
  bad_request: { statusCode: HttpStatus.BAD_REQUEST, safeMessage: 'Invalid request.', logLevel: 'warn' },
  unauthorized: { statusCode: HttpStatus.UNAUTHORIZED, safeMessage: 'Not authenticated.', logLevel: 'warn' },
  forbidden: { statusCode: HttpStatus.FORBIDDEN, safeMessage: 'Access denied.', logLevel: 'warn' },
  not_found: { statusCode: HttpStatus.NOT_FOUND, safeMessage: 'Resource not found.', logLevel: 'warn' },
  conflict: { statusCode: HttpStatus.CONFLICT, safeMessage: 'State conflict.', logLevel: 'warn' },
  rate_limited: { statusCode: HttpStatus.TOO_MANY_REQUESTS, safeMessage: 'Request limit exceeded.', logLevel: 'warn' },
  internal_server_error: { statusCode: HttpStatus.INTERNAL_SERVER_ERROR, safeMessage: 'Internal server error.', logLevel: 'error' },
  current_user_missing: { statusCode: HttpStatus.UNAUTHORIZED, safeMessage: 'Not authenticated.', logLevel: 'error' },
  invalid_origin: { statusCode: HttpStatus.FORBIDDEN, safeMessage: 'Origin not allowed.', logLevel: 'warn' },
  invalid_internal_token: { statusCode: HttpStatus.UNAUTHORIZED, safeMessage: 'Invalid internal token.', logLevel: 'warn' },
  invalid_token: { statusCode: HttpStatus.UNAUTHORIZED, safeMessage: 'Invalid token.', logLevel: 'warn' },
  invalid_token_type: { statusCode: HttpStatus.UNAUTHORIZED, safeMessage: 'Invalid token.', logLevel: 'warn' },
  token_expired: { statusCode: HttpStatus.UNAUTHORIZED, safeMessage: 'Session expired.', logLevel: 'info' },
  jwt_secret_not_configured: { statusCode: HttpStatus.INTERNAL_SERVER_ERROR, safeMessage: 'Authentication unavailable.', logLevel: 'error' },
  missing_access_token: { statusCode: HttpStatus.UNAUTHORIZED, safeMessage: 'Not authenticated.', logLevel: 'info' },
  user_not_found: { statusCode: HttpStatus.UNAUTHORIZED, safeMessage: 'User not authenticated.', logLevel: 'warn' },
  invalid_credentials: { statusCode: HttpStatus.UNAUTHORIZED, safeMessage: 'Invalid credentials.', logLevel: 'info' },
  invalid_signup: { statusCode: HttpStatus.UNAUTHORIZED, safeMessage: 'Invalid signup data.', logLevel: 'info' },
  email_already_registered: { statusCode: HttpStatus.CONFLICT, safeMessage: 'Email is already registered.', logLevel: 'info' },
  google_oauth_not_configured: { statusCode: HttpStatus.BAD_REQUEST, safeMessage: 'Google sign-in is not configured.', logLevel: 'error' },
  google_auth_failed: { statusCode: HttpStatus.UNAUTHORIZED, safeMessage: 'Google authentication failed.', logLevel: 'warn' },
  google_email_not_verified: { statusCode: HttpStatus.UNAUTHORIZED, safeMessage: 'Google email is not verified.', logLevel: 'warn' },
  invalid_google_oauth_state: { statusCode: HttpStatus.UNAUTHORIZED, safeMessage: 'Google authentication session expired.', logLevel: 'warn' },
  invalid_login_payload: { statusCode: HttpStatus.BAD_REQUEST, safeMessage: 'Invalid login payload.', logLevel: 'warn' },
  invalid_signup_payload: { statusCode: HttpStatus.BAD_REQUEST, safeMessage: 'Invalid signup payload.', logLevel: 'warn' },
  invalid_query_payload: { statusCode: HttpStatus.BAD_REQUEST, safeMessage: 'Invalid query payload.', logLevel: 'warn' },
  invalid_workspace_query: { statusCode: HttpStatus.BAD_REQUEST, safeMessage: 'Invalid workspace.', logLevel: 'warn' },
  invalid_create_workspace_payload: { statusCode: HttpStatus.BAD_REQUEST, safeMessage: 'Invalid workspace creation payload.', logLevel: 'warn' },
  invalid_create_project_payload: { statusCode: HttpStatus.BAD_REQUEST, safeMessage: 'Invalid project creation payload.', logLevel: 'warn' },
  invalid_create_note_payload: { statusCode: HttpStatus.BAD_REQUEST, safeMessage: 'Invalid note creation payload.', logLevel: 'warn' },
  invalid_note_id: { statusCode: HttpStatus.BAD_REQUEST, safeMessage: 'Invalid note identifier.', logLevel: 'warn' },
  invalid_ingest_payload: { statusCode: HttpStatus.BAD_REQUEST, safeMessage: 'Invalid ingest payload.', logLevel: 'warn' },
  invalid_conversation_payload: { statusCode: HttpStatus.BAD_REQUEST, safeMessage: 'Invalid conversation payload.', logLevel: 'warn' },
  invalid_reminder_dispatch_query: { statusCode: HttpStatus.BAD_REQUEST, safeMessage: 'Invalid reminders query.', logLevel: 'warn' },
  invalid_mark_reminders_payload: { statusCode: HttpStatus.BAD_REQUEST, safeMessage: 'Invalid reminders payload.', logLevel: 'warn' },
  invalid_github_webhook_payload: { statusCode: HttpStatus.BAD_REQUEST, safeMessage: 'Invalid GitHub webhook payload.', logLevel: 'warn' },
  invalid_whatsapp_webhook_payload: { statusCode: HttpStatus.BAD_REQUEST, safeMessage: 'Invalid WhatsApp webhook payload.', logLevel: 'warn' },
  invalid_telegram_webhook_payload: { statusCode: HttpStatus.BAD_REQUEST, safeMessage: 'Invalid Telegram webhook payload.', logLevel: 'warn' },
  invalid_integration_connection_payload: { statusCode: HttpStatus.BAD_REQUEST, safeMessage: 'Invalid integration payload.', logLevel: 'warn' },
  invalid_integration_resolution_payload: { statusCode: HttpStatus.BAD_REQUEST, safeMessage: 'Invalid internal integration payload.', logLevel: 'warn' },
  invalid_github_app_callback: { statusCode: HttpStatus.BAD_REQUEST, safeMessage: 'Invalid GitHub callback.', logLevel: 'warn' },
  invalid_github_repositories_payload: { statusCode: HttpStatus.BAD_REQUEST, safeMessage: 'Invalid repositories payload.', logLevel: 'warn' },
  invalid_internal_ingest_payload: { statusCode: HttpStatus.BAD_REQUEST, safeMessage: 'Invalid internal ingest payload.', logLevel: 'warn' },
  invalid_internal_query_payload: { statusCode: HttpStatus.BAD_REQUEST, safeMessage: 'Invalid internal query payload.', logLevel: 'warn' },
  invalid_internal_conversation_payload: { statusCode: HttpStatus.BAD_REQUEST, safeMessage: 'Invalid internal conversation payload.', logLevel: 'warn' },
  invalid_internal_reminder_dispatch_query: { statusCode: HttpStatus.BAD_REQUEST, safeMessage: 'Invalid internal reminders query.', logLevel: 'warn' },
  invalid_internal_mark_reminders_payload: { statusCode: HttpStatus.BAD_REQUEST, safeMessage: 'Invalid internal reminders payload.', logLevel: 'warn' },
  provider_not_supported: { statusCode: HttpStatus.BAD_REQUEST, safeMessage: 'Provider not supported.', logLevel: 'warn' },
  provider_not_found: { statusCode: HttpStatus.NOT_FOUND, safeMessage: 'Provider not found.', logLevel: 'warn' },
  note_not_found: { statusCode: HttpStatus.NOT_FOUND, safeMessage: 'Note not found.', logLevel: 'info' },
  connection_session_not_found: { statusCode: HttpStatus.NOT_FOUND, safeMessage: 'Connection session not found.', logLevel: 'info' },
  invalid_connection_state: { statusCode: HttpStatus.UNAUTHORIZED, safeMessage: 'Invalid connection state.', logLevel: 'warn' },
  github_callback_missing_installation: { statusCode: HttpStatus.BAD_REQUEST, safeMessage: 'GitHub installation missing in callback.', logLevel: 'warn' },
  external_identity_already_bound: { statusCode: HttpStatus.CONFLICT, safeMessage: 'External identity is already linked.', logLevel: 'warn' },
  missing_external_identity: { statusCode: HttpStatus.UNAUTHORIZED, safeMessage: 'Missing external identity.', logLevel: 'warn' },
  external_identity_required: { statusCode: HttpStatus.NOT_FOUND, safeMessage: 'External identity is required.', logLevel: 'warn' },
  identity_not_found: { statusCode: HttpStatus.NOT_FOUND, safeMessage: 'External identity not found.', logLevel: 'warn' },
  workspace_slug_required: { statusCode: HttpStatus.BAD_REQUEST, safeMessage: 'Workspace is required.', logLevel: 'warn' },
  workspace_not_found: { statusCode: HttpStatus.NOT_FOUND, safeMessage: 'Workspace not found.', logLevel: 'warn' },
  workspace_already_exists: { statusCode: HttpStatus.CONFLICT, safeMessage: 'Workspace already exists for this user.', logLevel: 'warn' },
  project_slug_already_exists: { statusCode: HttpStatus.CONFLICT, safeMessage: 'Project slug is already registered.', logLevel: 'info' },
  project_repo_already_mapped: { statusCode: HttpStatus.CONFLICT, safeMessage: 'Repository is already linked to another project.', logLevel: 'info' },
  project_not_found: { statusCode: HttpStatus.NOT_FOUND, safeMessage: 'Project not found.', logLevel: 'info' },
  project_has_notes: { statusCode: HttpStatus.BAD_REQUEST, safeMessage: 'Delete or move the project notes before removing it.', logLevel: 'info' },
  folder_not_found: { statusCode: HttpStatus.NOT_FOUND, safeMessage: 'Folder not found.', logLevel: 'info' },
  folder_has_notes: { statusCode: HttpStatus.BAD_REQUEST, safeMessage: 'Delete or move the folder notes before removing it.', logLevel: 'info' },
  return_to_path_must_be_relative: { statusCode: HttpStatus.BAD_REQUEST, safeMessage: 'Invalid return destination.', logLevel: 'warn' },
  credential_not_found: { statusCode: HttpStatus.NOT_FOUND, safeMessage: 'Credential not found.', logLevel: 'warn' },
  github_app_installation_not_configured: { statusCode: HttpStatus.BAD_REQUEST, safeMessage: 'GitHub App installation is not configured.', logLevel: 'warn' },
  github_app_install_url_not_configured: { statusCode: HttpStatus.BAD_REQUEST, safeMessage: 'GitHub App installation URL is unavailable.', logLevel: 'error' },
  github_installation_validation_failed: { statusCode: HttpStatus.UNAUTHORIZED, safeMessage: 'Failed to validate the GitHub installation.', logLevel: 'warn' },
  github_installation_not_accessible: { statusCode: HttpStatus.UNAUTHORIZED, safeMessage: 'GitHub installation is not accessible.', logLevel: 'warn' },
  github_webhook_secret_not_configured: { statusCode: HttpStatus.UNAUTHORIZED, safeMessage: 'GitHub webhook is unavailable.', logLevel: 'error' },
  invalid_github_signature: { statusCode: HttpStatus.UNAUTHORIZED, safeMessage: 'Invalid GitHub signature.', logLevel: 'warn' },
  missing_installation_id: { statusCode: HttpStatus.UNAUTHORIZED, safeMessage: 'Missing GitHub installation.', logLevel: 'warn' },
  invalid_webhook_token: { statusCode: HttpStatus.UNAUTHORIZED, safeMessage: 'Invalid webhook token.', logLevel: 'warn' },
  telegram_bot_token_not_configured: { statusCode: HttpStatus.BAD_REQUEST, safeMessage: 'Telegram is not configured.', logLevel: 'error' },
  review_ai_not_configured: { statusCode: HttpStatus.BAD_REQUEST, safeMessage: 'Review AI is not configured.', logLevel: 'warn' },
  conversation_ai_not_configured: { statusCode: HttpStatus.BAD_REQUEST, safeMessage: 'Conversation AI is not configured.', logLevel: 'warn' },
  credentials_encryption_key_must_be_32_bytes_base64: { statusCode: HttpStatus.INTERNAL_SERVER_ERROR, safeMessage: 'Credential encryption is unavailable.', logLevel: 'error' },
  invalid_encrypted_config: { statusCode: HttpStatus.INTERNAL_SERVER_ERROR, safeMessage: 'Stored credential is invalid.', logLevel: 'error' },
  KB_DATABASE_URL_not_configured: { statusCode: HttpStatus.INTERNAL_SERVER_ERROR, safeMessage: 'Database is not configured.', logLevel: 'error' },
} as const satisfies Record<string, HttpErrorDefinition>;

export type HttpErrorCode = keyof typeof httpErrorCatalog;

const statusFallbackCode: Record<number, HttpErrorCode> = {
  [HttpStatus.BAD_REQUEST]: 'bad_request',
  [HttpStatus.UNAUTHORIZED]: 'unauthorized',
  [HttpStatus.FORBIDDEN]: 'forbidden',
  [HttpStatus.NOT_FOUND]: 'not_found',
  [HttpStatus.CONFLICT]: 'conflict',
  [HttpStatus.TOO_MANY_REQUESTS]: 'rate_limited',
  [HttpStatus.INTERNAL_SERVER_ERROR]: 'internal_server_error',
};

export function isKnownHttpErrorCode(value: string): value is HttpErrorCode {
  return value in httpErrorCatalog;
}

export function resolveHttpErrorCode(input: { code?: string; statusCode?: number }): HttpErrorCode {
  if (input.code && isKnownHttpErrorCode(input.code)) return input.code;
  if (input.statusCode && input.statusCode >= HttpStatus.INTERNAL_SERVER_ERROR) return 'internal_server_error';
  return statusFallbackCode[input.statusCode || HttpStatus.INTERNAL_SERVER_ERROR] || 'internal_server_error';
}
