import { afterEach, describe, expect, it, vi } from 'vitest';
import { detectUserCountry } from '../../../src/shared/utils/location';

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('detectUserCountry', () => {
  it('detects BR when timezone is America/Sao_Paulo', () => {
    vi.spyOn(Intl.DateTimeFormat.prototype, 'resolvedOptions').mockReturnValue({
      calendar: 'gregory',
      locale: 'en-US',
      numberingSystem: 'latn',
      timeZone: 'America/Sao_Paulo',
    });

    expect(detectUserCountry()).toBe('BR');
  });

  it('detects BR when language is pt-BR even if timezone is not BR', () => {
    vi.spyOn(Intl.DateTimeFormat.prototype, 'resolvedOptions').mockReturnValue({
      calendar: 'gregory',
      locale: 'en-US',
      numberingSystem: 'latn',
      timeZone: 'America/New_York',
    });

    vi.stubGlobal('navigator', {
      language: 'pt-BR',
      languages: ['pt-BR', 'en-US'],
    });

    expect(detectUserCountry()).toBe('BR');
  });

  it('detects US when timezone is America/New_York and language is en-US', () => {
    vi.spyOn(Intl.DateTimeFormat.prototype, 'resolvedOptions').mockReturnValue({
      calendar: 'gregory',
      locale: 'en-US',
      numberingSystem: 'latn',
      timeZone: 'America/New_York',
    });

    vi.stubGlobal('navigator', {
      language: 'en-US',
      languages: ['en-US'],
    });

    expect(detectUserCountry()).toBe('US');
  });
});
