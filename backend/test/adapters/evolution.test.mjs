import test from 'node:test';
import assert from 'node:assert/strict';

import { EvolutionWhatsappReplySender } from '../../dist/adapters/evolution.js';

test('evolution whatsapp sender posts plain text without bot prefix', async () => {
  process.env.EVOLUTION_API_URL = 'https://evolution.example';
  process.env.EVOLUTION_API_KEY = 'evolution-key';
  process.env.EVOLUTION_INSTANCE_NAME = 'kb-instance';
  const originalFetch = globalThis.fetch;
  const calls = [];

  globalThis.fetch = async (url, options) => {
    calls.push({ url, options });
    return { ok: true, status: 200 };
  };

  try {
    const sender = new EvolutionWhatsappReplySender();
    const result = await sender.sendText({ groupJid: '120363@g.us', text: 'Resposta final' });

    assert.equal(result.ok, true);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, 'https://evolution.example/message/sendText/kb-instance');
    assert.equal(calls[0].options.method, 'POST');
    assert.equal(calls[0].options.headers['content-type'], 'application/json');
    assert.equal(calls[0].options.headers.apikey, 'evolution-key');
    assert.deepEqual(JSON.parse(calls[0].options.body), {
      number: '120363@g.us',
      text: 'Resposta final',
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});
