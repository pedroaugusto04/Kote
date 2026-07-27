import { Module } from '@nestjs/common';
import { ObjectStorage } from '../../application/ports/notes/object-storage.js';
import { ContentObjectStorageService } from '../../application/services/content/content-object-storage.service.js';
import { SupabaseObjectStorage } from '../storage/supabase-object-storage.js';

@Module({
  providers: [
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
