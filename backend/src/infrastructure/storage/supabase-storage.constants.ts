export const SUPABASE_STORAGE_ERRORS = {
  URL_NOT_CONFIGURED: 'SUPABASE_URL_not_configured',
  SERVICE_ROLE_KEY_NOT_CONFIGURED: 'SUPABASE_SERVICE_ROLE_KEY_not_configured',
  BUCKET_NOT_CONFIGURED: 'KB_SUPABASE_STORAGE_BUCKET_not_configured',
  PUT_FAILED: 'supabase_storage_put_failed',
  GET_FAILED: 'supabase_storage_get_failed',
  DELETE_FAILED: 'supabase_storage_delete_failed',
  UNKNOWN: 'unknown_error',
  MISSING_BLOB: 'missing_blob',
} as const;

export const SUPABASE_STORAGE_DEFAULTS = {
  CACHE_CONTROL: '31536000',
  CONTENT_TYPE: 'application/octet-stream',
} as const;
