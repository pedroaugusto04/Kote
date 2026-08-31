import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { NOTE_EXPORT_FORMATS } from '../../../src/shared/constants/export.constants';
import { sanitizeFileName } from '../../../src/shared/utils/text';
import {
  buildNoteExportContent,
  downloadNoteAsFile,
} from '../../../src/shared/utils/note-export';


describe('note-export utils', () => {
  describe('sanitizeFileName', () => {
    it('cleans special characters, accents, and converts spaces to hyphens', () => {
      expect(sanitizeFileName('Deploy da Aplicação em Produção! (v2.0)')).toBe('deploy-da-aplicacao-em-producao-v2-0');
    });

    it('falls back to default name when title is empty or has only invalid characters', () => {
      expect(sanitizeFileName('')).toBe('note');
      expect(sanitizeFileName('   ')).toBe('note');
      expect(sanitizeFileName('???!!!', 'fallback-note')).toBe('fallback-note');
    });

    it('handles titles with already clean slug format', () => {
      expect(sanitizeFileName('my-note-title')).toBe('my-note-title');
    });
  });

  describe('buildNoteExportContent', () => {
    it('returns markdown content when note.markdown is present', () => {
      const content = buildNoteExportContent({
        title: 'Note Title',
        markdown: '# Custom Markdown\n\nFull body content.',
        summary: 'Summary text',
      });
      expect(content).toBe('# Custom Markdown\n\nFull body content.');
    });

    it('falls back to title and editor rawText when markdown is missing or empty', () => {
      const content = buildNoteExportContent({
        title: 'Draft Note',
        markdown: '',
        summary: 'Ignored summary when rawText is present',
        editor: { rawText: 'Draft body text.' },
      });
      expect(content).toBe('# Draft Note\n\nDraft body text.');
    });

    it('falls back to summary when rawText is missing', () => {
      const content = buildNoteExportContent({
        title: 'Summary Note',
        markdown: '',
        summary: 'Only summary content available.',
      });
      expect(content).toBe('# Summary Note\n\nOnly summary content available.');
    });
  });

  describe('downloadNoteAsFile', () => {
    let createObjectURLSpy: any;
    let revokeObjectURLSpy: any;
    let clickSpy: any;

    beforeEach(() => {
      createObjectURLSpy = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:http://localhost/test-blob');
      revokeObjectURLSpy = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
      clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    });

    afterEach(() => {
      vi.restoreAllMocks();
    });

    it('creates a download link with markdown extension by default and triggers click', () => {
      const note = {
        title: 'Release Notes 1.0',
        markdown: '# Release Notes 1.0\n\nChangelog details',
        summary: 'Changelog details',
      };

      downloadNoteAsFile(note);

      expect(createObjectURLSpy).toHaveBeenCalledTimes(1);
      expect(clickSpy).toHaveBeenCalledTimes(1);
      expect(revokeObjectURLSpy).toHaveBeenCalledWith('blob:http://localhost/test-blob');
    });

    it('supports downloading as txt format', () => {
      const note = {
        title: 'Plain Text Note',
        markdown: '# Plain Text Note\n\nSome plain content',
        summary: '',
      };

      downloadNoteAsFile(note, NOTE_EXPORT_FORMATS.TEXT);

      expect(createObjectURLSpy).toHaveBeenCalledTimes(1);
      expect(clickSpy).toHaveBeenCalledTimes(1);
      expect(revokeObjectURLSpy).toHaveBeenCalledWith('blob:http://localhost/test-blob');
    });
  });
});
