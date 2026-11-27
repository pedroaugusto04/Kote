import { Injectable } from '@nestjs/common';
import { TransactionManager } from '../../application/ports/persistence/transaction-manager.port.js';
import { PostgresDatabase } from './database.js';

@Injectable()
export class PostgresTransactionManager extends TransactionManager {
  constructor(private readonly database: PostgresDatabase) {
    super();
  }

  runInTransaction<T>(fn: (tx: unknown) => Promise<T>): Promise<T> {
    return this.database.getDb().transaction(async (tx) => fn(tx));
  }
}
