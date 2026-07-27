export type NoteChunk = {
  chunkIndex: number;
  chunkText: string;
};

export type NoteChunkAttachment = {
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  content?: string;
};
