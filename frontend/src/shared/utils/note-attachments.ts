import type { PendingAttachment } from '../api/models/note';

export function toPendingAttachment(file: File, mimeType: string): Promise<PendingAttachment> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      resolve({
        fileName: file.name,
        mimeType,
        sizeBytes: file.size,
        dataBase64: (reader.result as string).split(',')[1] || '',
      });
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}
