import { ConfigurationException } from './app.exception.js';
import { AppErrorCode } from './error-codes.js';

export class StorageConfigException extends ConfigurationException {
  constructor(
    code:
      | typeof AppErrorCode.SupabaseUrlNotConfigured
      | typeof AppErrorCode.SupabaseServiceRoleKeyNotConfigured
      | typeof AppErrorCode.SupabaseStorageBucketNotConfigured,
  ) {
    super(code);
  }
}

export class DatabaseConfigException extends ConfigurationException {
  constructor() {
    super(AppErrorCode.DatabaseUrlNotConfigured);
  }
}

export class RabbitMqConfigException extends ConfigurationException {
  constructor() {
    super(AppErrorCode.RabbitMqNotConfigured);
  }
}

export class CredentialsEncryptionConfigException extends ConfigurationException {
  constructor(
    code:
      | typeof AppErrorCode.CredentialsEncryptionKeyInvalid
      | typeof AppErrorCode.InvalidEncryptedConfig,
  ) {
    super(code);
  }
}
