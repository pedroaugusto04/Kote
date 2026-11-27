import { HttpStatus } from '@nestjs/common';
import type { AppErrorCode } from '../domain/exceptions/error-codes.js';
import { HttpErrorLogLevel } from './observability.enums.js';

type HttpErrorDefinition = {
  statusCode: number;
  safeMessage: string;
  logLevel: HttpErrorLogLevel;
};

const badRequest = (safeMessage: string, logLevel: HttpErrorLogLevel = HttpErrorLogLevel.Warn): HttpErrorDefinition => ({
  statusCode: HttpStatus.BAD_REQUEST,
  safeMessage,
  logLevel,
});

const unauthorized = (safeMessage: string, logLevel: HttpErrorLogLevel = HttpErrorLogLevel.Warn): HttpErrorDefinition => ({
  statusCode: HttpStatus.UNAUTHORIZED,
  safeMessage,
  logLevel,
});

const forbidden = (safeMessage: string, logLevel: HttpErrorLogLevel = HttpErrorLogLevel.Warn): HttpErrorDefinition => ({
  statusCode: HttpStatus.FORBIDDEN,
  safeMessage,
  logLevel,
});

const notFound = (safeMessage: string, logLevel: HttpErrorLogLevel = HttpErrorLogLevel.Info): HttpErrorDefinition => ({
  statusCode: HttpStatus.NOT_FOUND,
  safeMessage,
  logLevel,
});

const conflict = (safeMessage: string, logLevel: HttpErrorLogLevel = HttpErrorLogLevel.Warn): HttpErrorDefinition => ({
  statusCode: HttpStatus.CONFLICT,
  safeMessage,
  logLevel,
});

const internalError = (safeMessage: string): HttpErrorDefinition => ({
  statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
  safeMessage,
  logLevel: HttpErrorLogLevel.Error,
});

export const httpErrorCatalog = {
  // Generic fallbacks
  bad_request: badRequest('Invalid request.'),
  unauthorized: unauthorized('Not authenticated.'),
  forbidden: forbidden('Access denied.'),
  not_found: notFound('Resource not found.', HttpErrorLogLevel.Warn),
  conflict: conflict('State conflict.'),
  payload_too_large: { statusCode: HttpStatus.PAYLOAD_TOO_LARGE, safeMessage: 'The uploaded file or attachment is too large.', logLevel: HttpErrorLogLevel.Warn },
  rate_limited: { statusCode: HttpStatus.TOO_MANY_REQUESTS, safeMessage: 'Request limit exceeded.', logLevel: HttpErrorLogLevel.Warn },
  internal_server_error: internalError('Internal server error.'),

  // Auth & Security
  current_user_missing: unauthorized('Not authenticated.', HttpErrorLogLevel.Error),
  invalid_origin: forbidden('Origin not allowed.'),
  invalid_host_header: badRequest('Invalid request host.'),
  invalid_internal_token: unauthorized('Invalid internal token.'),
  invalid_token: unauthorized('Invalid token.'),
  invalid_token_type: unauthorized('Invalid token.'),
  invalid_connection_token: unauthorized('Invalid connection token.'),
  token_expired: unauthorized('Session expired.', HttpErrorLogLevel.Info),
  jwt_secret_not_configured: internalError('Authentication unavailable.'),
  missing_access_token: unauthorized('Not authenticated.', HttpErrorLogLevel.Info),
  user_not_found: unauthorized('User not authenticated.'),
  invalid_credentials: unauthorized('Invalid credentials.', HttpErrorLogLevel.Info),
  invalid_signup: unauthorized('Invalid signup data.', HttpErrorLogLevel.Info),
  email_already_registered: conflict('Email is already registered.', HttpErrorLogLevel.Info),
  google_oauth_not_configured: badRequest('Google sign-in is not configured.', HttpErrorLogLevel.Error),
  google_oauth_redirect_uri_not_configured: badRequest('Google sign-in redirect URI is not configured.', HttpErrorLogLevel.Error),
  google_auth_failed: unauthorized('Google authentication failed.'),
  google_email_not_verified: unauthorized('Google email is not verified.'),
  invalid_google_oauth_state: unauthorized('Google authentication session expired.'),
  return_to_path_must_be_relative: badRequest('Invalid return destination.'),
  avatar_file_required: badRequest('Choose a profile photo to upload.'),
  unsupported_avatar_type: badRequest('Profile photo must be a PNG, JPEG, or WebP image.'),
  avatar_file_too_large: { statusCode: HttpStatus.PAYLOAD_TOO_LARGE, safeMessage: 'Profile photo must be 2 MB or smaller.', logLevel: HttpErrorLogLevel.Warn },
  avatar_not_found: notFound('Profile photo not found.'),
  test_email_auth_not_configured: badRequest('Test email authentication is not configured.', HttpErrorLogLevel.Error),
  invalid_test_email_auth: unauthorized('Invalid test email authentication.'),

  // Workspace
  workspace_slug_required: badRequest('Workspace is required.'),
  workspace_slug_missing: notFound('Workspace is required.', HttpErrorLogLevel.Warn),
  workspace_not_found: notFound('Workspace not found.', HttpErrorLogLevel.Warn),
  workspace_slug_already_exists: conflict('Workspace slug is already registered.', HttpErrorLogLevel.Info),

  // Project & Folder
  project_slug_missing: notFound('Project is required.', HttpErrorLogLevel.Warn),
  project_not_found: notFound('Project not found.'),
  project_slug_already_exists: conflict('Project slug is already registered.', HttpErrorLogLevel.Info),
  project_has_notes: badRequest('Delete or move the project notes before removing it.', HttpErrorLogLevel.Info),
  folder_not_found: notFound('Folder not found.'),
  project_folder_not_found: notFound('Folder not found.'),
  folder_parent_not_found: notFound('Parent folder not found.'),
  folder_slug_already_exists: conflict('Folder slug already exists in this location.', HttpErrorLogLevel.Info),
  folder_has_notes: badRequest('Delete or move the folder notes before removing it.', HttpErrorLogLevel.Info),
  folder_not_empty: badRequest('Folder is not empty.'),
  folder_cycle_not_allowed: badRequest('Folder cycle is not allowed.'),
  project_brief_generation_failed: { statusCode: HttpStatus.SERVICE_UNAVAILABLE, safeMessage: 'Project brief generation failed.', logLevel: HttpErrorLogLevel.Warn },

  // Notes, Attachments, Reminders, Reviews, Commits
  note_not_found: notFound('Note not found.'),
  note_not_ai_session: badRequest('Note is not an AI session.'),
  attachment_not_found: notFound('Attachment not found.'),
  commit_or_note_not_found: notFound('Commit or note not found.'),
  reminder_not_found: notFound('Reminder not found.'),
  review_not_found: notFound('Review not found.'),

  // Billing & Quota
  quota_exceeded: forbidden('Quota limit exceeded.'),
  plan_not_found: notFound('Plan not found.', HttpErrorLogLevel.Warn),
  subscription_not_found: notFound('Subscription not found.', HttpErrorLogLevel.Warn),
  payment_not_found: notFound('Payment not found.', HttpErrorLogLevel.Warn),
  gateway_customer_not_found: notFound('Gateway customer not found.', HttpErrorLogLevel.Warn),
  payment_gateway_error: badRequest('Payment gateway error. Please try again.'),
  payment_gateway_timeout: { statusCode: HttpStatus.GATEWAY_TIMEOUT, safeMessage: 'Payment gateway timed out. Please try again.', logLevel: HttpErrorLogLevel.Warn },
  payment_gateway_unavailable: { statusCode: HttpStatus.BAD_GATEWAY, safeMessage: 'Payment gateway unavailable. Please try again later.', logLevel: HttpErrorLogLevel.Error },
  stripe_payment_failed: badRequest('Stripe payment failed. Please check your payment details.'),
  asaas_payment_failed: badRequest('Payment failed. Please check your payment details.'),
  external_reference_missing: badRequest('External reference is missing.'),
  external_reference_invalid: badRequest('External reference is invalid.'),

  // Integrations, Webhooks, GitHub, Dependencies, Push
  provider_not_supported: badRequest('Provider not supported.'),
  provider_not_found: notFound('Provider not found.', HttpErrorLogLevel.Warn),
  connection_session_not_found: notFound('Connection session not found.'),
  invalid_connection_state: unauthorized('Invalid connection state.'),
  external_identity_already_bound: conflict('External identity is already linked.'),
  missing_external_identity: unauthorized('Missing external identity.'),
  external_identity_required: notFound('External identity is required.', HttpErrorLogLevel.Warn),
  identity_not_found: notFound('External identity not found.', HttpErrorLogLevel.Warn),
  credential_not_found: notFound('Credential not found.', HttpErrorLogLevel.Warn),
  github_integration_not_found: notFound('GitHub integration not found.', HttpErrorLogLevel.Warn),
  github_credential_not_found: notFound('GitHub credential not found.', HttpErrorLogLevel.Warn),
  github_callback_missing_installation: badRequest('GitHub installation missing in callback.'),
  github_app_installation_not_configured: badRequest('GitHub App installation is not configured.'),
  github_app_install_url_not_configured: badRequest('GitHub App installation URL is unavailable.', HttpErrorLogLevel.Error),
  github_installation_not_accessible: unauthorized('GitHub installation is not accessible.'),
  github_installation_token_unavailable: badRequest('GitHub installation token is unavailable.'),
  github_webhook_secret_not_configured: unauthorized('GitHub webhook is unavailable.', HttpErrorLogLevel.Error),
  invalid_github_signature: unauthorized('Invalid GitHub signature.'),
  missing_installation_id: unauthorized('Missing GitHub installation.'),
  github_connection_required: badRequest('GitHub connection is required.'),
  github_repository_not_selected: badRequest('GitHub repository is not selected.'),
  invalid_project_repository_selection: badRequest('Invalid project repository selection.'),
  invalid_dependency_repository_selection: badRequest('Invalid dependency repository selection.'),
  repositories_required: badRequest('Repositories are required.'),
  backfill_already_completed: conflict('Backfill is already completed.'),
  job_not_found: notFound('Job not found.'),
  job_already_finished: badRequest('Job is already finished.'),
  dependency_not_found: notFound('Dependency not found.'),
  push_subscription_not_found: notFound('Push subscription not found.'),
  webhook_subscription_not_found: notFound('Webhook subscription not found.'),
  invalid_webhook_token: unauthorized('Invalid webhook token.'),
  missing_webhook_signature: unauthorized('Invalid webhook signature.'),
  invalid_webhook_signature: unauthorized('Invalid webhook signature.'),
  unauthorized_webhook: unauthorized('Unauthorized webhook.'),
  telegram_bot_token_not_configured: badRequest('Telegram is not configured.', HttpErrorLogLevel.Error),

  // AI
  review_ai_not_configured: badRequest('Review AI is not configured.'),
  review_ai_not_connected: badRequest('Review AI is not connected.'),
  conversation_ai_not_configured: badRequest('Conversation AI is not configured.'),
  ai_conversation_not_enabled: notFound('Conversation AI is not enabled for this workspace.', HttpErrorLogLevel.Warn),
  conversation_agent_unavailable: badRequest('Conversation agent is unavailable.'),
  project_brief_ai_not_configured: badRequest('Project Brief AI is not configured.'),
  project_brief_ai_not_connected: badRequest('Project Brief AI is not connected.'),
  file_notes_summary_ai_not_configured: badRequest('File Notes Summary AI is not configured.'),
  file_notes_summary_ai_not_connected: badRequest('File Notes Summary AI is not enabled for this workspace.'),
  ai_session_synthesis_not_configured: badRequest('AI Session Synthesis is not configured.'),
  ai_session_synthesis_not_connected: badRequest('AI Session Synthesis is not enabled for this workspace.'),
  pr_context_ai_not_configured: badRequest('PR Context AI is not configured.'),
  pr_context_ai_not_connected: badRequest('PR Context AI is not connected.'),
  embedding_strategy_not_available: internalError('Embedding service is not available.'),

  // Infrastructure & Configuration
  credentials_encryption_key_must_be_32_bytes_base64: internalError('Credential encryption is unavailable.'),
  invalid_encrypted_config: internalError('Stored credential is invalid.'),
  KB_DATABASE_URL_not_configured: internalError('Database is not configured.'),
  rabbitmq_not_configured: internalError('Message queue is not configured.'),
  SUPABASE_URL_not_configured: internalError('Object storage is not configured.'),
  SUPABASE_SERVICE_ROLE_KEY_not_configured: internalError('Object storage is not configured.'),
  KB_SUPABASE_STORAGE_BUCKET_not_configured: internalError('Object storage is not configured.'),

  // Validation codes
  invalid_login_payload: badRequest('Invalid login payload.'),
  invalid_signup_payload: badRequest('Invalid signup payload.'),
  invalid_update_profile_payload: badRequest('Invalid profile update payload.'),
  invalid_exchange_payload: badRequest('Invalid token exchange payload.'),
  invalid_query_payload: badRequest('Invalid query payload.'),
  invalid_workspace_query: badRequest('Invalid workspace.'),
  invalid_create_workspace_payload: badRequest('Invalid workspace creation payload.'),
  invalid_create_project_payload: badRequest('Invalid project creation payload.'),
  invalid_update_project_payload: badRequest('Invalid project update payload.'),
  invalid_projects_query: badRequest('Invalid projects query.'),
  invalid_set_favorite_payload: badRequest('Invalid favorite payload.'),
  invalid_create_folder_payload: badRequest('Invalid folder creation payload.'),
  invalid_update_folder_payload: badRequest('Invalid folder update payload.'),
  invalid_project_timeline_query: badRequest('Invalid project timeline query.'),
  invalid_project_knowledge_map_query: badRequest('Invalid project knowledge map query.'),
  invalid_project_decisions_query: badRequest('Invalid project decisions query.'),
  invalid_project_commits_query: badRequest('Invalid project commits query.'),
  invalid_sync_project_commits_payload: badRequest('Invalid project commits sync payload.'),
  invalid_export_adr_query: badRequest('Invalid ADR export query.'),
  invalid_export_zip_query: badRequest('Invalid ZIP export query.'),
  invalid_create_note_payload: badRequest('Invalid note creation payload.'),
  invalid_update_note_payload: badRequest('Invalid note update payload.'),
  invalid_note_id: badRequest('Invalid note identifier.'),
  invalid_note_attachment_id: badRequest('Invalid attachment identifier.'),
  invalid_note_commit_id: badRequest('Invalid note commit identifier.'),
  invalid_link_note_commit_payload: badRequest('Invalid note commit link payload.'),
  invalid_notes_query: badRequest('Invalid notes query.'),
  invalid_notes_by_file_query: badRequest('Invalid notes by file query.'),
  invalid_notes_by_snippet_query: badRequest('Invalid notes by snippet query.'),
  invalid_notes_by_snippet_payload: badRequest('Invalid notes by snippet payload.'),
  invalid_related_notes_by_file_query: badRequest('Invalid related notes query.'),
  invalid_file_notes_summary_query: badRequest('Invalid file notes summary query.'),
  invalid_pin_note_payload: badRequest('Invalid pin note payload.'),
  invalid_bulk_update_note_status_payload: badRequest('Invalid bulk note status payload.'),
  invalid_auto_action_global_payload: badRequest('Invalid auto-action payload.'),
  invalid_session_handoff_payload: badRequest('Invalid session handoff payload.'),
  invalid_ingest_payload: badRequest('Invalid ingest payload.'),
  invalid_ask_payload: badRequest('Invalid ask payload.'),
  invalid_ask_history_query: badRequest('Invalid ask history query.'),
  invalid_ask_conversations_query: badRequest('Invalid ask conversations query.'),
  invalid_conversation_id: badRequest('Invalid conversation identifier.'),
  invalid_agent_conversation_payload: badRequest('Invalid agent conversation payload.'),
  invalid_ai_analytics_query: badRequest('Invalid AI analytics query.'),
  invalid_application_access_payload: badRequest('Invalid application access payload.'),
  invalid_pagination_input: badRequest('Invalid pagination parameters.'),
  invalid_reminder_dispatch_query: badRequest('Invalid reminders query.'),
  invalid_mark_reminders_payload: badRequest('Invalid reminders payload.'),
  invalid_reminder_board_query: badRequest('Invalid reminder board query.'),
  invalid_reminders_query: badRequest('Invalid reminders query.'),
  invalid_reminder_id: badRequest('Invalid reminder identifier.'),
  invalid_reminder_status_payload: badRequest('Invalid reminder status payload.'),
  invalid_bulk_update_reminder_status_payload: badRequest('Invalid bulk reminder status payload.'),
  invalid_review_id: badRequest('Invalid review identifier.'),
  invalid_reviews_query: badRequest('Invalid reviews query.'),
  invalid_github_webhook_payload: badRequest('Invalid GitHub webhook payload.'),
  invalid_whatsapp_webhook_payload: badRequest('Invalid WhatsApp webhook payload.'),
  invalid_telegram_webhook_payload: badRequest('Invalid Telegram webhook payload.'),
  invalid_integration_connection_payload: badRequest('Invalid integration payload.'),
  invalid_integration_resolution_payload: badRequest('Invalid internal integration payload.'),
  invalid_github_app_callback: badRequest('Invalid GitHub callback.'),
  invalid_github_repositories_payload: badRequest('Invalid repositories payload.'),
  invalid_github_backfill_payload: badRequest('Invalid GitHub backfill payload.'),
  invalid_github_backfill_cancel_payload: badRequest('Invalid GitHub backfill cancel payload.'),
  invalid_github_backfill_status_query: badRequest('Invalid GitHub backfill status query.'),
  invalid_subscription_payload: badRequest('Invalid subscription payload.'),
  invalid_email_payload: badRequest('Invalid email payload.'),
  invalid_test_email_payload: badRequest('Invalid test email payload.'),
  invalid_create_push_subscription_payload: badRequest('Invalid push subscription payload.'),
  invalid_delete_push_subscription_payload: badRequest('Invalid push subscription deletion payload.'),
  invalid_create_webhook_subscription_payload: badRequest('Invalid webhook subscription payload.'),
  invalid_update_webhook_subscription_payload: badRequest('Invalid webhook subscription update payload.'),
  invalid_webhook_subscription_id: badRequest('Invalid webhook subscription identifier.'),
  invalid_import_dependencies_payload: badRequest('Invalid dependency import payload.'),
  invalid_save_monitored_repositories_payload: badRequest('Invalid monitored repositories payload.'),
  invalid_check_dependency_payload: badRequest('Invalid dependency check payload.'),
  invalid_toggle_dependency_payload: badRequest('Invalid dependency toggle payload.'),
} as const satisfies Record<AppErrorCode, HttpErrorDefinition>;

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
