import { DOMParser, DOMImplementation } from '@xmldom/xmldom';

const Parser = DOMParser;
try {
  const doc = new Parser().parseFromString("", "text/html");
  console.log("Parsed doc:", doc ? "yes" : "no");
} catch (e) {
  console.log("Error parsing text/html:", e);
}
