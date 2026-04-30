export type ObjectStoragePutInput = {
  key: string;
  body: Buffer | string;
  contentType?: string;
};

export class ObjectStorageMissingContentError extends Error {
  constructor(key: string) {
    super(`object_storage_content_missing:${key}`);
    this.name = 'ObjectStorageMissingContentError';
  }
}

export abstract class ObjectStorage {
  abstract put(input: ObjectStoragePutInput): Promise<void>;
  abstract get(key: string): Promise<Buffer>;
  abstract delete(key: string): Promise<void>;
}
