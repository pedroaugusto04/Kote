import test from 'node:test';
import assert from 'node:assert/strict';

import { extractWhatsappExternalId, parseWhatsappEvolutionMessage } from '../../../dist/application/utils/webhook.utils.js';
import { buildWhatsappWebhookCommand } from '../../../dist/application/utils/whatsapp-webhook-command.utils.js';

test('whatsapp parser accepts payload with data array', () => {
  const parsed = parseWhatsappEvolutionMessage({
    event: 'MESSAGES_UPSERT',
    data: [
      {
        key: {
          remoteJid: '120363@g.us',
          participant: '5511999999999@s.whatsapp.net',
          id: 'msg-1',
          fromMe: false,
        },
        message: {
          conversation: 'salve um lembrete para me enviar 17:44 de hoje',
        },
      },
    ],
  });

  assert.equal(parsed.kind, 'message');
  assert.equal(parsed.chatId, '120363@g.us');
  assert.equal(parsed.messageText, 'salve um lembrete para me enviar 17:44 de hoje');
  assert.equal(extractWhatsappExternalId({
    event: 'MESSAGES_UPSERT',
    data: [{ key: { remoteJid: '120363@g.us' } }],
  }), '120363@g.us');
});

test('whatsapp command parser accepts private chats as external identities', () => {
  const body = {
    event: 'MESSAGES_UPSERT',
    data: {
      key: {
        remoteJid: '5511999999999@s.whatsapp.net',
        id: 'private-msg-1',
        fromMe: false,
      },
      message: {
        conversation: 'corrigi timeout no webhook',
      },
    },
  };

  const parsed = parseWhatsappEvolutionMessage(body);
  assert.equal(parsed.kind, 'message');
  assert.equal(parsed.chatId, '5511999999999@s.whatsapp.net');
  assert.equal(parsed.senderId, '5511999999999@s.whatsapp.net');
  assert.equal(parsed.isGroup, false);
  assert.equal(extractWhatsappExternalId(body), '5511999999999@s.whatsapp.net');

  const command = buildWhatsappWebhookCommand(body);
  assert.equal(command.kind, 'conversation');
  assert.equal(command.externalId, '5511999999999@s.whatsapp.net');
  assert.equal(command.input.chatId, '5511999999999@s.whatsapp.net');
});

test('whatsapp command parser ignores group messages without /kb prefix', () => {
  const command = buildWhatsappWebhookCommand({
    event: 'MESSAGES_UPSERT',
    data: {
      key: {
        remoteJid: '120363@g.us',
        participant: '5511999999999@s.whatsapp.net',
        id: 'group-msg-no-prefix',
        fromMe: false,
      },
      message: {
        conversation: 'corrigi timeout no webhook',
      },
    },
  });

  assert.deepEqual(command, { kind: 'ignore', reason: 'missing_group_prefix' });
});

test('whatsapp command parser accepts group messages with /kb prefix and strips it', () => {
  const command = buildWhatsappWebhookCommand({
    event: 'MESSAGES_UPSERT',
    data: {
      key: {
        remoteJid: '120363@g.us',
        participant: '5511999999999@s.whatsapp.net',
        id: 'group-msg-prefix',
        fromMe: false,
      },
      message: {
        conversation: '/kb corrigi timeout no webhook',
      },
    },
  });

  assert.equal(command.kind, 'conversation');
  assert.equal(command.externalId, '120363@g.us');
  assert.equal(command.input.chatId, '120363@g.us');
  assert.equal(command.input.messageText, 'corrigi timeout no webhook');
});

test('whatsapp parser unwraps ephemeral and view-once messages', () => {
  const ephemeral = parseWhatsappEvolutionMessage({
    event: 'MESSAGES_UPSERT',
    data: {
      key: {
        remoteJid: '120363@g.us',
        participant: '5511999999999@s.whatsapp.net',
        id: 'msg-2',
        fromMe: false,
      },
      message: {
        ephemeralMessage: {
          message: {
            extendedTextMessage: {
              text: 'o conteudo e: teste para envio de lembrete',
            },
          },
        },
      },
    },
  });

  assert.equal(ephemeral.kind, 'message');
  assert.equal(ephemeral.messageText, 'o conteudo e: teste para envio de lembrete');

  const viewOnce = parseWhatsappEvolutionMessage({
    event: 'MESSAGES_UPSERT',
    data: {
      key: {
        remoteJid: '120363@g.us',
        participant: '5511999999999@s.whatsapp.net',
        id: 'msg-3',
        fromMe: false,
      },
      message: {
        viewOnceMessage: {
          message: {
            conversation: 'mensagem em view once',
          },
        },
      },
    },
  });

  assert.equal(viewOnce.kind, 'message');
  assert.equal(viewOnce.messageText, 'mensagem em view once');

  const viewOnceV2 = parseWhatsappEvolutionMessage({
    event: 'MESSAGES_UPSERT',
    data: {
      key: {
        remoteJid: '120363@g.us',
        participant: '5511999999999@s.whatsapp.net',
        id: 'msg-4',
        fromMe: false,
      },
      message: {
        viewOnceMessageV2: {
          message: {
            conversation: 'mensagem em view once v2',
          },
        },
      },
    },
  });

  assert.equal(viewOnceV2.kind, 'message');
  assert.equal(viewOnceV2.messageText, 'mensagem em view once v2');
});

test('whatsapp parser extracts captioned media metadata and base64 payload', () => {
  const parsed = parseWhatsappEvolutionMessage({
    event: 'MESSAGES_UPSERT',
    data: {
      key: {
        remoteJid: '120363@g.us',
        participant: '5511999999999@s.whatsapp.net',
        id: 'msg-media',
        fromMe: false,
      },
      message: {
        imageMessage: {
          caption: 'corrigi timeout no webhook',
          mimetype: 'image/png',
          fileName: 'erro.png',
          fileLength: 11,
        },
      },
      dataBase64: Buffer.from('hello image').toString('base64'),
    },
  });

  assert.equal(parsed.kind, 'message');
  assert.equal(parsed.messageText, 'corrigi timeout no webhook');
  assert.equal(parsed.hasMedia, true);
  assert.deepEqual(parsed.media, {
    fileName: 'erro.png',
    mimeType: 'image/png',
    sizeBytes: 11,
    dataBase64: Buffer.from('hello image').toString('base64'),
  });
});

test('whatsapp parser unwraps Evolution document-with-caption media and nested base64', () => {
  const pdfBase64 = Buffer.from('hello pdf').toString('base64');
  const parsed = parseWhatsappEvolutionMessage({
    event: 'MESSAGES_UPSERT',
    data: {
      key: {
        remoteJid: '120363@g.us',
        participant: '5511999999999@s.whatsapp.net',
        id: 'msg-pdf',
        fromMe: false,
      },
      message: {
        documentWithCaptionMessage: {
          message: {
            documentMessage: {
              caption: 'salvar pdf do contrato',
              mimetype: 'application/pdf',
              fileName: 'contrato.pdf',
              fileLength: '9',
            },
          },
        },
      },
      data: {
        base64: `data:application/pdf;base64,${pdfBase64}`,
      },
    },
  });

  assert.equal(parsed.kind, 'message');
  assert.equal(parsed.messageText, 'salvar pdf do contrato');
  assert.equal(parsed.hasMedia, true);
  assert.deepEqual(parsed.media, {
    fileName: 'contrato.pdf',
    mimeType: 'application/pdf',
    sizeBytes: 9,
    dataBase64: pdfBase64,
  });
});
