import { DOMParser, DOMImplementation } from '@xmldom/xmldom';
import TurndownService from 'turndown';

const OriginalDOMParser = DOMParser;
class ShimmedDOMParser extends OriginalDOMParser {
  parseFromString(source, mimeType) {
    if (!source || source.trim() === '') {
      return super.parseFromString('<html />', 'text/xml');
    }
    const targetMime = mimeType === 'text/html' ? 'text/xml' : mimeType;
    return super.parseFromString(source, targetMime);
  }
}

globalThis.DOMParser = ShimmedDOMParser;
globalThis.document = new DOMImplementation().createDocument('http://www.w3.org/1999/xhtml', 'html', null);

// Check if canParseHTMLNatively works
function canParseHTMLNatively() {
  var Parser = globalThis.DOMParser;
  var canParse = false;
  try {
    if (new Parser().parseFromString("", "text/html")) {
      canParse = true;
    }
  } catch (e) {
    console.error("canParseHTMLNatively error:", e);
  }
  return canParse;
}

console.log("canParseHTMLNatively:", canParseHTMLNatively());

const service = new TurndownService();
const markdown = service.turndown('<h1>Hello World</h1><p>Test</p>');
console.log('MARKDOWN SUCCESS:', markdown);
