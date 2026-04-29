import { HttpStatus } from '@nestjs/common';

export type HttpErrorLogLevel = 'debug' | 'info' | 'warn' | 'error';

type HttpErrorDefinition = {
  statusCode: number;
  safeMessage: string;
  logLevel: HttpErrorLogLevel;
};

export const httpErrorCatalog = {
  bad_request: { statusCode: HttpStatus.BAD_REQUEST, safeMessage: 'Requisicao invalida.', logLevel: 'warn' },
  unauthorized: { statusCode: HttpStatus.UNAUTHORIZED, safeMessage: 'Nao autenticado.', logLevel: 'warn' },
  forbidden: { statusCode: HttpStatus.FORBIDDEN, safeMessage: 'Acesso negado.', logLevel: 'warn' },
  not_found: { statusCode: HttpStatus.NOT_FOUND, safeMessage: 'Recurso nao encontrado.', logLevel: 'warn' },
  conflict: { statusCode: HttpStatus.CONFLICT, safeMessage: 'Conflito de estado.', logLevel: 'warn' },
  rate_limited: { statusCode: HttpStatus.TOO_MANY_REQUESTS, safeMessage: 'Limite de requisicoes excedido.', logLevel: 'warn' },
  internal_server_error: { statusCode: HttpStatus.INTERNAL_SERVER_ERROR, safeMessage: 'Erro interno do servidor.', logLevel: 'error' },
  current_user_missing: { statusCode: HttpStatus.UNAUTHORIZED, safeMessage: 'Nao autenticado.', logLevel: 'error' },
  invalid_origin: { statusCode: HttpStatus.FORBIDDEN, safeMessage: 'Origem nao permitida.', logLevel: 'warn' },
  invalid_internal_token: { statusCode: HttpStatus.UNAUTHORIZED, safeMessage: 'Token interno invalido.', logLevel: 'warn' },
  invalid_token: { statusCode: HttpStatus.UNAUTHORIZED, safeMessage: 'Token invalido.', logLevel: 'warn' },
  invalid_token_type: { statusCode: HttpStatus.UNAUTHORIZED, safeMessage: 'Token invalido.', logLevel: 'warn' },
  token_expired: { statusCode: HttpStatus.UNAUTHORIZED, safeMessage: 'Sessao expirada.', logLevel: 'info' },
  jwt_secret_not_configured: { statusCode: HttpStatus.INTERNAL_SERVER_ERROR, safeMessage: 'Autenticacao indisponivel.', logLevel: 'error' },
  missing_access_token: { statusCode: HttpStatus.UNAUTHORIZED, safeMessage: 'Nao autenticado.', logLevel: 'info' },
  user_not_found: { statusCode: HttpStatus.UNAUTHORIZED, safeMessage: 'Usuario nao autenticado.', logLevel: 'warn' },
  invalid_credentials: { statusCode: HttpStatus.UNAUTHORIZED, safeMessage: 'Credenciais invalidas.', logLevel: 'info' },
  invalid_signup: { statusCode: HttpStatus.UNAUTHORIZED, safeMessage: 'Dados de cadastro invalidos.', logLevel: 'info' },
  email_already_registered: { statusCode: HttpStatus.CONFLICT, safeMessage: 'Email ja cadastrado.', logLevel: 'info' },
  invalid_login_payload: { statusCode: HttpStatus.BAD_REQUEST, safeMessage: 'Payload de login invalido.', logLevel: 'warn' },
  invalid_signup_payload: { statusCode: HttpStatus.BAD_REQUEST, safeMessage: 'Payload de cadastro invalido.', logLevel: 'warn' },
  invalid_query_payload: { statusCode: HttpStatus.BAD_REQUEST, safeMessage: 'Payload de consulta invalido.', logLevel: 'warn' },
  invalid_workspace_query: { statusCode: HttpStatus.BAD_REQUEST, safeMessage: 'Workspace invalido.', logLevel: 'warn' },
  invalid_create_workspace_payload: { statusCode: HttpStatus.BAD_REQUEST, safeMessage: 'Payload de criacao de workspace invalido.', logLevel: 'warn' },
  invalid_note_id: { statusCode: HttpStatus.BAD_REQUEST, safeMessage: 'Identificador de nota invalido.', logLevel: 'warn' },
  invalid_ingest_payload: { statusCode: HttpStatus.BAD_REQUEST, safeMessage: 'Payload de ingestao invalido.', logLevel: 'warn' },
  invalid_conversation_payload: { statusCode: HttpStatus.BAD_REQUEST, safeMessage: 'Payload de conversa invalido.', logLevel: 'warn' },
  invalid_reminder_dispatch_query: { statusCode: HttpStatus.BAD_REQUEST, safeMessage: 'Consulta de lembretes invalida.', logLevel: 'warn' },
  invalid_mark_reminders_payload: { statusCode: HttpStatus.BAD_REQUEST, safeMessage: 'Payload de lembretes invalido.', logLevel: 'warn' },
  invalid_github_webhook_payload: { statusCode: HttpStatus.BAD_REQUEST, safeMessage: 'Payload de webhook GitHub invalido.', logLevel: 'warn' },
  invalid_whatsapp_webhook_payload: { statusCode: HttpStatus.BAD_REQUEST, safeMessage: 'Payload de webhook WhatsApp invalido.', logLevel: 'warn' },
  invalid_telegram_webhook_payload: { statusCode: HttpStatus.BAD_REQUEST, safeMessage: 'Payload de webhook Telegram invalido.', logLevel: 'warn' },
  invalid_integration_connection_payload: { statusCode: HttpStatus.BAD_REQUEST, safeMessage: 'Payload de integracao invalido.', logLevel: 'warn' },
  invalid_integration_resolution_payload: { statusCode: HttpStatus.BAD_REQUEST, safeMessage: 'Payload interno de integracao invalido.', logLevel: 'warn' },
  invalid_github_app_callback: { statusCode: HttpStatus.BAD_REQUEST, safeMessage: 'Callback do GitHub invalido.', logLevel: 'warn' },
  invalid_github_repositories_payload: { statusCode: HttpStatus.BAD_REQUEST, safeMessage: 'Payload de repositorios invalido.', logLevel: 'warn' },
  invalid_internal_ingest_payload: { statusCode: HttpStatus.BAD_REQUEST, safeMessage: 'Payload interno de ingestao invalido.', logLevel: 'warn' },
  invalid_internal_query_payload: { statusCode: HttpStatus.BAD_REQUEST, safeMessage: 'Payload interno de consulta invalido.', logLevel: 'warn' },
  invalid_internal_conversation_payload: { statusCode: HttpStatus.BAD_REQUEST, safeMessage: 'Payload interno de conversa invalido.', logLevel: 'warn' },
  invalid_internal_reminder_dispatch_query: { statusCode: HttpStatus.BAD_REQUEST, safeMessage: 'Consulta interna de lembretes invalida.', logLevel: 'warn' },
  invalid_internal_mark_reminders_payload: { statusCode: HttpStatus.BAD_REQUEST, safeMessage: 'Payload interno de lembretes invalido.', logLevel: 'warn' },
  provider_not_supported: { statusCode: HttpStatus.BAD_REQUEST, safeMessage: 'Provider nao suportado.', logLevel: 'warn' },
  provider_not_found: { statusCode: HttpStatus.NOT_FOUND, safeMessage: 'Provider nao encontrado.', logLevel: 'warn' },
  note_not_found: { statusCode: HttpStatus.NOT_FOUND, safeMessage: 'Nota nao encontrada.', logLevel: 'info' },
  connection_session_not_found: { statusCode: HttpStatus.NOT_FOUND, safeMessage: 'Sessao de conexao nao encontrada.', logLevel: 'info' },
  invalid_connection_state: { statusCode: HttpStatus.UNAUTHORIZED, safeMessage: 'Estado de conexao invalido.', logLevel: 'warn' },
  github_callback_missing_code_or_installation: { statusCode: HttpStatus.BAD_REQUEST, safeMessage: 'Callback do GitHub incompleto.', logLevel: 'warn' },
  external_identity_already_bound: { statusCode: HttpStatus.CONFLICT, safeMessage: 'Identidade externa ja vinculada.', logLevel: 'warn' },
  missing_external_identity: { statusCode: HttpStatus.UNAUTHORIZED, safeMessage: 'Identidade externa ausente.', logLevel: 'warn' },
  external_identity_required: { statusCode: HttpStatus.NOT_FOUND, safeMessage: 'Identidade externa obrigatoria.', logLevel: 'warn' },
  identity_not_found: { statusCode: HttpStatus.NOT_FOUND, safeMessage: 'Identidade externa nao encontrada.', logLevel: 'warn' },
  workspace_slug_required: { statusCode: HttpStatus.BAD_REQUEST, safeMessage: 'Workspace obrigatorio.', logLevel: 'warn' },
  workspace_not_found: { statusCode: HttpStatus.NOT_FOUND, safeMessage: 'Workspace nao encontrado.', logLevel: 'warn' },
  workspace_already_exists: { statusCode: HttpStatus.CONFLICT, safeMessage: 'Workspace ja existe para este usuario.', logLevel: 'warn' },
  return_to_path_must_be_relative: { statusCode: HttpStatus.BAD_REQUEST, safeMessage: 'Destino de retorno invalido.', logLevel: 'warn' },
  credential_not_found: { statusCode: HttpStatus.NOT_FOUND, safeMessage: 'Credencial nao encontrada.', logLevel: 'warn' },
  github_app_installation_not_configured: { statusCode: HttpStatus.BAD_REQUEST, safeMessage: 'Instalacao do GitHub App nao configurada.', logLevel: 'warn' },
  github_app_install_url_not_configured: { statusCode: HttpStatus.BAD_REQUEST, safeMessage: 'URL de instalacao do GitHub App indisponivel.', logLevel: 'error' },
  github_app_oauth_not_configured: { statusCode: HttpStatus.BAD_REQUEST, safeMessage: 'OAuth do GitHub App nao configurado.', logLevel: 'error' },
  github_oauth_exchange_failed: { statusCode: HttpStatus.UNAUTHORIZED, safeMessage: 'Falha ao validar o acesso do GitHub.', logLevel: 'warn' },
  github_installation_validation_failed: { statusCode: HttpStatus.UNAUTHORIZED, safeMessage: 'Falha ao validar a instalacao do GitHub.', logLevel: 'warn' },
  github_installation_not_accessible: { statusCode: HttpStatus.UNAUTHORIZED, safeMessage: 'Instalacao do GitHub nao acessivel.', logLevel: 'warn' },
  github_webhook_secret_not_configured: { statusCode: HttpStatus.UNAUTHORIZED, safeMessage: 'Webhook GitHub indisponivel.', logLevel: 'error' },
  invalid_github_signature: { statusCode: HttpStatus.UNAUTHORIZED, safeMessage: 'Assinatura do GitHub invalida.', logLevel: 'warn' },
  missing_installation_id: { statusCode: HttpStatus.UNAUTHORIZED, safeMessage: 'Instalacao do GitHub ausente.', logLevel: 'warn' },
  invalid_webhook_token: { statusCode: HttpStatus.UNAUTHORIZED, safeMessage: 'Token de webhook invalido.', logLevel: 'warn' },
  telegram_bot_token_not_configured: { statusCode: HttpStatus.BAD_REQUEST, safeMessage: 'Telegram nao configurado.', logLevel: 'error' },
  review_ai_not_configured: { statusCode: HttpStatus.BAD_REQUEST, safeMessage: 'IA de review nao configurada.', logLevel: 'warn' },
  conversation_ai_not_configured: { statusCode: HttpStatus.BAD_REQUEST, safeMessage: 'IA de conversa nao configurada.', logLevel: 'warn' },
  credentials_encryption_key_must_be_32_bytes_base64: { statusCode: HttpStatus.INTERNAL_SERVER_ERROR, safeMessage: 'Criptografia de credenciais indisponivel.', logLevel: 'error' },
  invalid_encrypted_config: { statusCode: HttpStatus.INTERNAL_SERVER_ERROR, safeMessage: 'Credencial armazenada invalida.', logLevel: 'error' },
  KB_DATABASE_URL_not_configured: { statusCode: HttpStatus.INTERNAL_SERVER_ERROR, safeMessage: 'Banco de dados nao configurado.', logLevel: 'error' },
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
