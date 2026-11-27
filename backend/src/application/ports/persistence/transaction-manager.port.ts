export abstract class TransactionManager {
  abstract runInTransaction<T>(fn: (tx: unknown) => Promise<T>): Promise<T>;
}
