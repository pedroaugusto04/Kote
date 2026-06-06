import test from 'node:test';
import assert from 'node:assert/strict';

import { ReminderDeliveryChannel } from '../../dist/contracts/enums.js';
import { EvolutionReminderDeliveryGateway, EvolutionWhatsappMediaDownloader, EvolutionWhatsappReplySender } from '../../dist/adapters/evolution.js';

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
    const result = await sender.sendText({ chatJid: '120363@g.us', text: 'Resposta final' });

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

test('evolution whatsapp sender posts media payload', async () => {
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
    const result = await sender.sendMedia({
      chatJid: '120363@g.us',
      mediaType: 'document',
      mimeType: 'application/pdf',
      fileName: 'deploy.pdf',
      mediaBase64: Buffer.from('deploy pdf').toString('base64'),
      caption: 'Deploy',
    });

    assert.equal(result.ok, true);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, 'https://evolution.example/message/sendMedia/kb-instance');
    assert.equal(calls[0].options.method, 'POST');
    assert.equal(calls[0].options.headers['content-type'], 'application/json');
    assert.equal(calls[0].options.headers.apikey, 'evolution-key');
    assert.deepEqual(JSON.parse(calls[0].options.body), {
      number: '120363@g.us',
      mediatype: 'document',
      mimetype: 'application/pdf',
      media: Buffer.from('deploy pdf').toString('base64'),
      fileName: 'deploy.pdf',
      caption: 'Deploy',
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('evolution reminder delivery gateway maps unified reminder payload to whatsapp sender', async () => {
  const gateway = new EvolutionReminderDeliveryGateway({
    sendText: async (input) => ({ ok: input.chatJid === '120363@g.us', error: input.chatJid ? undefined : 'missing_chat' }),
    sendMedia: async () => ({ ok: false, error: 'not_used' }),
  });

  const result = await gateway.sendText({
    channel: ReminderDeliveryChannel.Whatsapp,
    recipientId: '120363@g.us',
    text: 'Reminder text',
    workspaceSlug: 'default',
    userId: 'user-1',
  });

  assert.equal(result.ok, true);
  assert.equal(result.error, undefined);
});

test('evolution whatsapp media downloader accepts nested base64 response', async () => {
  process.env.EVOLUTION_API_URL = 'https://evolution.example';
  process.env.EVOLUTION_API_KEY = 'evolution-key';
  process.env.EVOLUTION_INSTANCE_NAME = 'kb-instance';
  const originalFetch = globalThis.fetch;
  const calls = [];
  const fileBase64 = Buffer.from('hello pdf').toString('base64');

  globalThis.fetch = async (url, options) => {
    calls.push({ url, options });
    return {
      ok: true,
      status: 200,
      json: async () => ({ data: { base64: `data:application/pdf;base64,${fileBase64}` } }),
    };
  };

  try {
    const downloader = new EvolutionWhatsappMediaDownloader();
    const result = await downloader.downloadBase64({
      body: {
        data: {
          key: { remoteJid: '120363@g.us', id: 'msg-pdf' },
          message: {
            documentMessage: {
              fileName: 'contrato.pdf',
              mimetype: 'application/pdf',
            },
          },
        },
      },
    });

    assert.deepEqual(result, { ok: true, dataBase64: fileBase64 });
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, 'https://evolution.example/chat/getBase64FromMediaMessage/kb-instance');
    assert.equal(JSON.parse(calls[0].options.body).message.key.id, 'msg-pdf');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('evolution whatsapp sender normalizes generic or missing filename extensions', async () => {
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
    
    // Test case 1: Generic extension '.image'
    await sender.sendMedia({
      chatJid: '120363@g.us',
      mediaType: 'image',
      mimeType: 'image/jpeg',
      fileName: 'attachment.image',
      mediaBase64: Buffer.from('hello').toString('base64'),
    });

    // Test case 2: Missing extension
    await sender.sendMedia({
      chatJid: '120363@g.us',
      mediaType: 'image',
      mimeType: 'image/png',
      fileName: 'custom_photo',
      mediaBase64: Buffer.from('hello').toString('base64'),
    });

    assert.equal(calls.length, 2);
    
    assert.equal(JSON.parse(calls[0].options.body).fileName, 'attachment.jpg');
    assert.equal(JSON.parse(calls[1].options.body).fileName, 'custom_photo.png');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('evolution whatsapp sender posts audio payload to sendWhatsAppAudio endpoint', async () => {
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
    
    // Test case: Sending audio as base64
    const result = await sender.sendMedia({
      chatJid: '120363@g.us',
      mediaType: 'audio',
      mimeType: 'audio/mp3',
      fileName: 'test.mp3',
      mediaBase64: Buffer.from('hello audio').toString('base64'),
    });

    assert.equal(result.ok, true);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, 'https://evolution.example/message/sendWhatsAppAudio/kb-instance');
    assert.equal(calls[0].options.method, 'POST');
    assert.equal(calls[0].options.headers['content-type'], 'application/json');
    assert.equal(calls[0].options.headers.apikey, 'evolution-key');
    assert.deepEqual(JSON.parse(calls[0].options.body), {
      number: '120363@g.us',
      audio: Buffer.from('hello audio').toString('base64'),
      options: {
        delay: 1200,
        encoding: true,
      },
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

