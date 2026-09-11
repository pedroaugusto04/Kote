import { describe, expect, it } from 'vitest';

import { getAcceptAttribute, isMimeTypeSupported, normalizeAttachmentMimeType } from '../../src/shared/constants/attachment-types';

describe('attachment ZIP types', () => {
  it('accepts standard ZIP MIME types and normalizes a missing browser MIME type', () => {
    expect(isMimeTypeSupported('application/zip', 'archive.zip')).toBe(true);
    expect(isMimeTypeSupported('application/x-zip-compressed', 'archive.zip')).toBe(true);
    expect(isMimeTypeSupported('', 'archive.zip')).toBe(true);
    expect(normalizeAttachmentMimeType('', 'archive.zip')).toBe('application/zip');
  });

  it('offers ZIP files in the native file picker', () => {
    expect(getAcceptAttribute()).toContain('.zip');
  });
});
