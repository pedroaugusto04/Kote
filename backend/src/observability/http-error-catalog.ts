import { HttpStatus } from '@nestjs/common';
import { HttpErrorLogLevel } from '../contracts/enums.js';

type HttpErrorDefinition = {
  statusCode: number;
  safeMessage: string;
  logLevel: HttpErrorLogLevel;
};

export const httpErrorCatalog = {
  bad_request: { statusCode: HttpStatus.BAD_REQUEST, safeMessage: 'Invalid request.', logLevel: HttpErrorLogLevel.Warn },
  unauthorized: { statusCode: HttpStatus.UNAUTHORIZED, safeMessage: 'Not authenticated.', logLevel: HttpErrorLogLevel.Warn },
  forbidden: { statusCode: HttpStatus.FORBIDDEN, safeMessage: 'Access denied.', logLevel: HttpErrorLogLevel.Warn },
  not_found: { statusCode: HttpStatus.NOT_FOUND, safeMessage: 'Resource not found.', logLevel: HttpErrorLogLevel.Warn },
  conflict: { statusCode: HttpStatus.CONFLICT, safeMessage: 'State conflict.', logLevel: HttpErrorLogLevel.Warn },
  rate_limited: { statusCode: HttpStatus.TOO_MANY_REQUESTS, safeMessage: 'Request limit exceeded.', logLevel: HttpErrorLogLevel.Warn },
  internal_server_error: { statusCode: HttpStatus.INTERNAL_SERVER_ERROR, safeMessage: 'Internal server error.', logLevel: HttpErrorLogLevel.Error },
  current_user_missing: { statusCode: HttpStatus.UNAUTHORIZED, safeMessage: 'Not authenticated.', logLevel: HttpErrorLogLevel.Error },
  invalid_origin: { statusCode: HttpStatus.FORBIDDEN, safeMessage: 'Origin not allowed.', logLevel: HttpErrorLogLevel.Warn },
  invalid_internal_token: { statusCode: HttpStatus.UNAUTHORIZED, safeMessage: 'Invalid internal token.', logLevel: HttpErrorLogLevel.Warn },
  invalid_token: { statusCode: HttpStatus.UNAUTHORIZED, safeMessage: 'Invalid token.', logLevel: HttpErrorLogLevel.Warn },
  invalid_token_type: { statusCode: HttpStatus.UNAUTHORIZED, safeMessage: 'Invalid token.', logLevel: HttpErrorLogLevel.Warn },
  token_expired: { statusCode: HttpStatus.UNAUTHORIZED, safeMessage: 'Session expired.', logLevel: HttpErrorLogLevel.Info },
  jwt_secret_not_configured: { statusCode: HttpStatus.INTERNAL_SERVER_ERROR, safeMessage: 'Authentication unavailable.', logLevel: HttpErrorLogLevel.Error },
  missing_access_token: { statusCode: HttpStatus.UNAUTHORIZED, safeMessage: 'Not authenticated.', logLevel: HttpErrorLogLevel.Info },
  user_not_found: { statusCode: HttpStatus.UNAUTHORIZED, safeMessage: 'User not authenticated.', logLevel: HttpErrorLogLevel.Warn },
  invalid_credentials: { statusCode: HttpStatus.UNAUTHORIZED, safeMessage: 'Invalid credentials.', logLevel: HttpErrorLogLevel.Info },
  invalid_signup: { statusCode: HttpStatus.UNAUTHORIZED, safeMessage: 'Invalid signup data.', logLevel: HttpErrorLogLevel.Info },
  email_already_registered: { statusCode: HttpStatus.CONFLICT, safeMessage: 'Email is already registered.', logLevel: HttpErrorLogLevel.Info },
  google_oauth_not_configured: { statusCode: HttpStatus.BAD_REQUEST, safeMessage: 'Google sign-in is not configured.', logLevel: HttpErrorLogLevel.Error },
  google_auth_failed: { statusCode: HttpStatus.UNAUTHORIZED, safeMessage: 'Google authentication failed.', logLevel: HttpErrorLogLevel.Warn },
  google_email_not_verified: { statusCode: HttpStatus.UNAUTHORIZED, safeMessage: 'Google email is not verified.', logLevel: HttpErrorLogLevel.Warn },
  invalid_google_oauth_state: { statusCode: HttpStatus.UNAUTHORIZED, safeMessage: 'Google authentication session expired.', logLevel: HttpErrorLogLevel.Warn },
  invalid_login_payload: { statusCode: HttpStatus.BAD_REQUEST, safeMessage: 'Invalid login payload.', logLevel: HttpErrorLogLevel.Warn },
  invalid_signup_payload: { statusCode: HttpStatus.BAD_REQUEST, safeMessage: 'Invalid signup payload.', logLevel: HttpErrorLogLevel.Warn },
  avatar_file_required: { statusCode: HttpStatus.BAD_REQUEST, safeMessage: 'Choose a profile photo to upload.', logLevel: HttpErrorLogLevel.Warn },
  unsupported_avatar_type: { statusCode: HttpStatus.BAD_REQUEST, safeMessage: 'Profile photo must be a PNG, JPEG, or WebP image.', logLevel: HttpErrorLogLevel.Warn },
  avatar_file_too_large: { statusCode: HttpStatus.PAYLOAD_TOO_LARGE, safeMessage: 'Profile photo must be 2 MB or smaller.', logLevel: HttpErrorLogLevel.Warn },
  unsupported_attachment_type: { statusCode: HttpStatus.BAD_REQUEST, safeMessage: 'Unsupported file type. Only common images, documents, audio, video, archives, and code files are supported.', logLevel: HttpErrorLogLevel.Warn },
  payload_too_large: { statusCode: HttpStatus.PAYLOAD_TOO_LARGE, safeMessage: 'The uploaded file or attachment is too large.', logLevel: HttpErrorLogLevel.Warn },
  avatar_not_found: { statusCode: HttpStatus.NOT_FOUND, safeMessage: 'Profile photo not found.', logLevel: HttpErrorLogLevel.Info },
  invalid_query_payload: { statusCode: HttpStatus.BAD_REQUEST, safeMessage: 'Invalid query payload.', logLevel: HttpErrorLogLevel.Warn },
  invalid_workspace_query: { statusCode: HttpStatus.BAD_REQUEST, safeMessage: 'Invalid workspace.', logLevel: HttpErrorLogLevel.Warn },
  invalid_create_workspace_payload: { statusCode: HttpStatus.BAD_REQUEST, safeMessage: 'Invalid workspace creation payload.', logLevel: HttpErrorLogLevel.Warn },
  invalid_create_project_payload: { statusCode: HttpStatus.BAD_REQUEST, safeMessage: 'Invalid project creation payload.', logLevel: HttpErrorLogLevel.Warn },
  invalid_create_note_payload: { statusCode: HttpStatus.BAD_REQUEST, safeMessage: 'Invalid note creation payload.', logLevel: HttpErrorLogLevel.Warn },
  invalid_note_id: { statusCode: HttpStatus.BAD_REQUEST, safeMessage: 'Invalid note identifier.', logLevel: HttpErrorLogLevel.Warn },
  invalid_ingest_payload: { statusCode: HttpStatus.BAD_REQUEST, safeMessage: 'Invalid ingest payload.', logLevel: HttpErrorLogLevel.Warn },
  invalid_conversation_payload: { statusCode: HttpStatus.BAD_REQUEST, safeMessage: 'Invalid conversation payload.', logLevel: HttpErrorLogLevel.Warn },
  invalid_reminder_dispatch_query: { statusCode: HttpStatus.BAD_REQUEST, safeMessage: 'Invalid reminders query.', logLevel: HttpErrorLogLevel.Warn },
  invalid_mark_reminders_payload: { statusCode: HttpStatus.BAD_REQUEST, safeMessage: 'Invalid reminders payload.', logLevel: HttpErrorLogLevel.Warn },
  invalid_github_webhook_payload: { statusCode: HttpStatus.BAD_REQUEST, safeMessage: 'Invalid GitHub webhook payload.', logLevel: HttpErrorLogLevel.Warn },
  invalid_whatsapp_webhook_payload: { statusCode: HttpStatus.BAD_REQUEST, safeMessage: 'Invalid WhatsApp webhook payload.', logLevel: HttpErrorLogLevel.Warn },
  invalid_telegram_webhook_payload: { statusCode: HttpStatus.BAD_REQUEST, safeMessage: 'Invalid Telegram webhook payload.', logLevel: HttpErrorLogLevel.Warn },
  invalid_integration_connection_payload: { statusCode: HttpStatus.BAD_REQUEST, safeMessage: 'Invalid integration payload.', logLevel: HttpErrorLogLevel.Warn },
  invalid_integration_resolution_payload: { statusCode: HttpStatus.BAD_REQUEST, safeMessage: 'Invalid internal integration payload.', logLevel: HttpErrorLogLevel.Warn },
  invalid_github_app_callback: { statusCode: HttpStatus.BAD_REQUEST, safeMessage: 'Invalid GitHub callback.', logLevel: HttpErrorLogLevel.Warn },
  invalid_github_repositories_payload: { statusCode: HttpStatus.BAD_REQUEST, safeMessage: 'Invalid repositories payload.', logLevel: HttpErrorLogLevel.Warn },
  invalid_internal_ingest_payload: { statusCode: HttpStatus.BAD_REQUEST, safeMessage: 'Invalid internal ingest payload.', logLevel: HttpErrorLogLevel.Warn },
  invalid_internal_query_payload: { statusCode: HttpStatus.BAD_REQUEST, safeMessage: 'Invalid internal query payload.', logLevel: HttpErrorLogLevel.Warn },
  invalid_internal_conversation_payload: { statusCode: HttpStatus.BAD_REQUEST, safeMessage: 'Invalid internal conversation payload.', logLevel: HttpErrorLogLevel.Warn },
  invalid_internal_reminder_dispatch_query: { statusCode: HttpStatus.BAD_REQUEST, safeMessage: 'Invalid internal reminders query.', logLevel: HttpErrorLogLevel.Warn },
  invalid_internal_mark_reminders_payload: { statusCode: HttpStatus.BAD_REQUEST, safeMessage: 'Invalid internal reminders payload.', logLevel: HttpErrorLogLevel.Warn },
  provider_not_supported: { statusCode: HttpStatus.BAD_REQUEST, safeMessage: 'Provider not supported.', logLevel: HttpErrorLogLevel.Warn },
  provider_not_found: { statusCode: HttpStatus.NOT_FOUND, safeMessage: 'Provider not found.', logLevel: HttpErrorLogLevel.Warn },
  note_not_found: { statusCode: HttpStatus.NOT_FOUND, safeMessage: 'Note not found.', logLevel: HttpErrorLogLevel.Info },
  connection_session_not_found: { statusCode: HttpStatus.NOT_FOUND, safeMessage: 'Connection session not found.', logLevel: HttpErrorLogLevel.Info },
  invalid_connection_state: { statusCode: HttpStatus.UNAUTHORIZED, safeMessage: 'Invalid connection state.', logLevel: HttpErrorLogLevel.Warn },
  github_callback_missing_installation: { statusCode: HttpStatus.BAD_REQUEST, safeMessage: 'GitHub installation missing in callback.', logLevel: HttpErrorLogLevel.Warn },
  external_identity_already_bound: { statusCode: HttpStatus.CONFLICT, safeMessage: 'External identity is already linked.', logLevel: HttpErrorLogLevel.Warn },
  missing_external_identity: { statusCode: HttpStatus.UNAUTHORIZED, safeMessage: 'Missing external identity.', logLevel: HttpErrorLogLevel.Warn },
  external_identity_required: { statusCode: HttpStatus.NOT_FOUND, safeMessage: 'External identity is required.', logLevel: HttpErrorLogLevel.Warn },
  identity_not_found: { statusCode: HttpStatus.NOT_FOUND, safeMessage: 'External identity not found.', logLevel: HttpErrorLogLevel.Warn },
  workspace_slug_required: { statusCode: HttpStatus.BAD_REQUEST, safeMessage: 'Workspace is required.', logLevel: HttpErrorLogLevel.Warn },
  workspace_not_found: { statusCode: HttpStatus.NOT_FOUND, safeMessage: 'Workspace not found.', logLevel: HttpErrorLogLevel.Warn },
  workspace_already_exists: { statusCode: HttpStatus.CONFLICT, safeMessage: 'Workspace already exists for this user.', logLevel: HttpErrorLogLevel.Warn },
  project_slug_already_exists: { statusCode: HttpStatus.CONFLICT, safeMessage: 'Project slug is already registered.', logLevel: HttpErrorLogLevel.Info },
  project_repo_already_mapped: { statusCode: HttpStatus.CONFLICT, safeMessage: 'Repository is already linked to another project.', logLevel: HttpErrorLogLevel.Info },
  project_not_found: { statusCode: HttpStatus.NOT_FOUND, safeMessage: 'Project not found.', logLevel: HttpErrorLogLevel.Info },
  project_has_notes: { statusCode: HttpStatus.BAD_REQUEST, safeMessage: 'Delete or move the project notes before removing it.', logLevel: HttpErrorLogLevel.Info },
  folder_not_found: { statusCode: HttpStatus.NOT_FOUND, safeMessage: 'Folder not found.', logLevel: HttpErrorLogLevel.Info },
  folder_has_notes: { statusCode: HttpStatus.BAD_REQUEST, safeMessage: 'Delete or move the folder notes before removing it.', logLevel: HttpErrorLogLevel.Info },
  return_to_path_must_be_relative: { statusCode: HttpStatus.BAD_REQUEST, safeMessage: 'Invalid return destination.', logLevel: HttpErrorLogLevel.Warn },
  credential_not_found: { statusCode: HttpStatus.NOT_FOUND, safeMessage: 'Credential not found.', logLevel: HttpErrorLogLevel.Warn },
  github_app_installation_not_configured: { statusCode: HttpStatus.BAD_REQUEST, safeMessage: 'GitHub App installation is not configured.', logLevel: HttpErrorLogLevel.Warn },
  github_app_install_url_not_configured: { statusCode: HttpStatus.BAD_REQUEST, safeMessage: 'GitHub App installation URL is unavailable.', logLevel: HttpErrorLogLevel.Error },
  github_installation_validation_failed: { statusCode: HttpStatus.UNAUTHORIZED, safeMessage: 'Failed to validate the GitHub installation.', logLevel: HttpErrorLogLevel.Warn },
  github_installation_not_accessible: { statusCode: HttpStatus.UNAUTHORIZED, safeMessage: 'GitHub installation is not accessible.', logLevel: HttpErrorLogLevel.Warn },
  github_webhook_secret_not_configured: { statusCode: HttpStatus.UNAUTHORIZED, safeMessage: 'GitHub webhook is unavailable.', logLevel: HttpErrorLogLevel.Error },
  invalid_github_signature: { statusCode: HttpStatus.UNAUTHORIZED, safeMessage: 'Invalid GitHub signature.', logLevel: HttpErrorLogLevel.Warn },
  missing_installation_id: { statusCode: HttpStatus.UNAUTHORIZED, safeMessage: 'Missing GitHub installation.', logLevel: HttpErrorLogLevel.Warn },
  invalid_webhook_token: { statusCode: HttpStatus.UNAUTHORIZED, safeMessage: 'Invalid webhook token.', logLevel: HttpErrorLogLevel.Warn },
  telegram_bot_token_not_configured: { statusCode: HttpStatus.BAD_REQUEST, safeMessage: 'Telegram is not configured.', logLevel: HttpErrorLogLevel.Error },
  review_ai_not_configured: { statusCode: HttpStatus.BAD_REQUEST, safeMessage: 'Review AI is not configured.', logLevel: HttpErrorLogLevel.Warn },
  conversation_ai_not_configured: { statusCode: HttpStatus.BAD_REQUEST, safeMessage: 'Conversation AI is not configured.', logLevel: HttpErrorLogLevel.Warn },
  project_brief_ai_not_configured: { statusCode: HttpStatus.BAD_REQUEST, safeMessage: 'Project Brief AI is not configured.', logLevel: HttpErrorLogLevel.Warn },
  project_brief_ai_not_connected: { statusCode: HttpStatus.BAD_REQUEST, safeMessage: 'Project Brief AI is not connected.', logLevel: HttpErrorLogLevel.Warn },
  project_brief_generation_failed: { statusCode: HttpStatus.SERVICE_UNAVAILABLE, safeMessage: 'Project brief generation failed.', logLevel: HttpErrorLogLevel.Warn },
  credentials_encryption_key_must_be_32_bytes_base64: { statusCode: HttpStatus.INTERNAL_SERVER_ERROR, safeMessage: 'Credential encryption is unavailable.', logLevel: HttpErrorLogLevel.Error },
  invalid_encrypted_config: { statusCode: HttpStatus.INTERNAL_SERVER_ERROR, safeMessage: 'Stored credential is invalid.', logLevel: HttpErrorLogLevel.Error },
  KB_DATABASE_URL_not_configured: { statusCode: HttpStatus.INTERNAL_SERVER_ERROR, safeMessage: 'Database is not configured.', logLevel: HttpErrorLogLevel.Error },
  payment_gateway_error: { statusCode: HttpStatus.BAD_REQUEST, safeMessage: 'Payment gateway error. Please try again.', logLevel: HttpErrorLogLevel.Warn },
  payment_gateway_timeout: { statusCode: HttpStatus.GATEWAY_TIMEOUT, safeMessage: 'Payment gateway timed out. Please try again.', logLevel: HttpErrorLogLevel.Warn },
  payment_gateway_unavailable: { statusCode: HttpStatus.BAD_GATEWAY, safeMessage: 'Payment gateway unavailable. Please try again later.', logLevel: HttpErrorLogLevel.Error },
  stripe_payment_failed: { statusCode: HttpStatus.BAD_REQUEST, safeMessage: 'Stripe payment failed. Please check your payment details.', logLevel: HttpErrorLogLevel.Warn },
  asaas_payment_failed: { statusCode: HttpStatus.BAD_REQUEST, safeMessage: 'Payment failed. Please check your payment details.', logLevel: HttpErrorLogLevel.Warn },
  subscription_not_found: { statusCode: HttpStatus.NOT_FOUND, safeMessage: 'Subscription not found.', logLevel: HttpErrorLogLevel.Warn },
  payment_not_found: { statusCode: HttpStatus.NOT_FOUND, safeMessage: 'Payment not found.', logLevel: HttpErrorLogLevel.Warn },
  plan_not_found: { statusCode: HttpStatus.NOT_FOUND, safeMessage: 'Plan not found.', logLevel: HttpErrorLogLevel.Warn },
  gateway_subscription_not_found: { statusCode: HttpStatus.NOT_FOUND, safeMessage: 'Gateway subscription not found.', logLevel: HttpErrorLogLevel.Warn },
  gateway_customer_not_found: { statusCode: HttpStatus.NOT_FOUND, safeMessage: 'Gateway customer not found.', logLevel: HttpErrorLogLevel.Warn },
  invalid_email_payload: { statusCode: HttpStatus.BAD_REQUEST, safeMessage: 'Invalid email payload.', logLevel: HttpErrorLogLevel.Warn },
  quota_exceeded: { statusCode: HttpStatus.FORBIDDEN, safeMessage: 'Quota limit exceeded.', logLevel: HttpErrorLogLevel.Warn },
} as const satisfies Record<string, HttpErrorDefinition>;

export type HttpErrorCode = keyof typeof httpErrorCatalog;

const statusFallbackCode: Record<number, HttpErrorCode> = {
  [HttpStatus.BAD_REQUEST]: 'bad_request',
  [HttpStatus.UNAUTHORIZED]: 'unauthorized',
  [HttpStatus.FORBIDDEN]: 'forbidden',
  [HttpStatus.NOT_FOUND]: 'not_found',
  [HttpStatus.CONFLICT]: 'conflict',
  [HttpStatus.PAYLOAD_TOO_LARGE]: 'payload_too_large',
  [HttpStatus.TOO_MANY_REQUESTS]: 'rate_limited',
  [HttpStatus.INTERNAL_SERVER_ERROR]: 'internal_server_error',
};

export function isKnownHttpErrorCode(value: string): value is HttpErrorCode {
  return value in httpErrorCatalog;
}

export function resolveHttpErrorCode(input: { code?: string; statusCode?: number }): HttpErrorCode {
  if (input.code) {
    if (isKnownHttpErrorCode(input.code)) return input.code;

    const normalizedCode = input.code.toLowerCase();
    if (isKnownHttpErrorCode(normalizedCode)) return normalizedCode;
  }
  if (input.statusCode && input.statusCode >= HttpStatus.INTERNAL_SERVER_ERROR) return 'internal_server_error';
  return statusFallbackCode[input.statusCode || HttpStatus.INTERNAL_SERVER_ERROR] || 'internal_server_error';
}
