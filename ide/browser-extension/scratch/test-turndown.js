import { DOMParser, DOMImplementation } from '@xmldom/xmldom';
import TurndownService from 'turndown';

globalThis.DOMParser = DOMParser;
globalThis.document = new DOMImplementation().createDocument('http://www.w3.org/1999/xhtml', 'html', null);

const service = new TurndownService();
const markdown = service.turndown('<h1>Hello World</h1><p>Test</p>');
console.log('MARKDOWN SUCCESS:', markdown);
