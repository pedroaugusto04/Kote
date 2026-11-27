import { Module } from '@nestjs/common';
import { ObjectStorage } from '../../application/ports/notes/object-storage.js';
import { ContentObjectStorageService } from '../../application/services/content/content-object-storage.service.js';
import {
  createSupabaseStorageClient,
  SUPABASE_STORAGE_CLIENT_FACTORY,
  SupabaseObjectStorage,
} from '../storage/supabase-object-storage.js';

@Module({
  providers: [
    { provide: SUPABASE_STORAGE_CLIENT_FACTORY, useValue: createSupabaseStorageClient },
    SupabaseObjectStorage,
    { provide: ObjectStorage, useExisting: SupabaseObjectStorage },
    ContentObjectStorageService,
  ],
  exports: [
    ObjectStorage,
    ContentObjectStorageService,
  ],
})
export class StorageModule {}
