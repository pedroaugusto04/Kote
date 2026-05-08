import test from 'node:test';
import assert from 'node:assert/strict';

import { extractWhatsappExternalId, parseWhatsappEvolutionMessage } from '../../dist/application/utils/webhook.utils.js';

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
  assert.equal(parsed.groupId, '120363@g.us');
  assert.equal(parsed.messageText, 'salve um lembrete para me enviar 17:44 de hoje');
  assert.equal(extractWhatsappExternalId({
    event: 'MESSAGES_UPSERT',
    data: [{ key: { remoteJid: '120363@g.us' } }],
  }), '120363@g.us');
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
});
