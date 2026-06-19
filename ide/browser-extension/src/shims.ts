import { DOMParser, DOMImplementation } from '@xmldom/xmldom';

if (typeof globalThis.DOMParser === 'undefined' || (globalThis.DOMParser as any).__isShim !== true) {
  const OriginalDOMParser = DOMParser;
  class ShimmedDOMParser extends OriginalDOMParser {
    static __isShim = true;
    parseFromString(source: string, mimeType: string) {
      if (!source || source.trim() === '') {
        return super.parseFromString('<html />', 'text/xml');
      }
      const targetMime = mimeType === 'text/html' ? 'text/xml' : mimeType;
      return super.parseFromString(source, targetMime);
    }
  }
  globalThis.DOMParser = ShimmedDOMParser as any;
}

if (typeof globalThis.document === 'undefined') {
  globalThis.document = new DOMImplementation().createDocument('http://www.w3.org/1999/xhtml', 'html', null) as any;
}
