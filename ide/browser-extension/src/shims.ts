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

// Turndown detects its environment with:
//   root = typeof window !== "undefined" ? window : {}
// In a service worker, `window` is undefined so `root` becomes {}, making
// root.DOMParser undefined and canParseHTMLNatively() return false.
// That fallback path (createHTMLParser) calls doc.write() which @xmldom/xmldom
// doesn't implement, leaving the document empty → getElementById returns null
// → collapseWhitespace crashes with "Cannot read properties of null (reading 'firstChild')".
// Aliasing globalThis as window makes Turndown find our shimmed DOMParser and
// use the native-parse path, which calls parseFromString() directly — safe.
if (typeof (globalThis as any).window === 'undefined') {
  (globalThis as any).window = globalThis;
}

if (typeof globalThis.document === 'undefined') {
  const shimDoc = new DOMImplementation().createDocument('http://www.w3.org/1999/xhtml', 'html', null) as any;

  // Belt-and-suspenders: if Turndown's shouldUseActiveX() probe is ever reached,
  // .open()/.write()/.close() must not throw. The probe only enables ActiveX when
  // window.ActiveXObject exists (never true in a service worker), so no-ops are safe.
  const originalCreateHTMLDocument = shimDoc.implementation.createHTMLDocument?.bind(shimDoc.implementation);
  if (originalCreateHTMLDocument) {
    shimDoc.implementation.createHTMLDocument = (title?: string) => {
      const doc = originalCreateHTMLDocument(title ?? '') as any;
      if (typeof doc.open !== 'function') {
        doc.open = () => doc;
        doc.write = () => {};
        doc.close = () => {};
      }
      return doc;
    };
  }

  globalThis.document = shimDoc;
}

