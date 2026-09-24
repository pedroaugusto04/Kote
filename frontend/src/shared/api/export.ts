import { requestBlob } from './request';
import { API_PATHS } from './api-paths.constants';

export async function exportGlobalData() {
  const result = await requestBlob(API_PATHS.EXPORT_GLOBAL);
  const fallbackFilename = `kote-export-${new Date().toISOString().split('T')[0]}.zip`;
  const filename = result.filename || fallbackFilename;

  if (typeof window !== 'undefined') {
    const objectUrl = window.URL.createObjectURL(result.blob);
    const anchor = document.createElement('a');
    anchor.style.display = 'none';
    anchor.href = objectUrl;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    window.URL.revokeObjectURL(objectUrl);
    document.body.removeChild(anchor);
  }

  return { ok: true, filename };
}
