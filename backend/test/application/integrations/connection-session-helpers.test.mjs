import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildBrowserRedirectUrl,
  extractConnectionCommandCode,
  normalizeBrowserOrigin,
  normalizeReturnToPath,
} from '../../../dist/application/integrations/connection-session.helpers.js';

test('connection command parser accepts English connect verb', () => {
  assert.equal(extractConnectionCommandCode('/kb connect AB12CD'), 'AB12CD');
  assert.equal(extractConnectionCommandCode('hello'), '');
});

test('connection redirect helpers reject unsafe values and preserve base paths', () => {
  assert.equal(normalizeBrowserOrigin('javascript:alert(1)'), '');
  assert.equal(normalizeBrowserOrigin('https://kb.example.com/path'), 'https://kb.example.com');
  assert.equal(normalizeReturnToPath('//evil.example.com', '/automations/integrations'), '/automations/integrations');

  const url = buildBrowserRedirectUrl('https://kb.example.com/knowledge-base', '/automations/integrations');
  url.searchParams.set('status', 'connected');
  assert.equal(url.toString(), 'https://kb.example.com/knowledge-base/automations/integrations?status=connected');
});
