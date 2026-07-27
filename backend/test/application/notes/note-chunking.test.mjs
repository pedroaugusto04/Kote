import test from 'node:test';
import assert from 'node:assert/strict';

import { NoteChunkingService } from '../../../dist/application/services/content/note-chunking.service.js';
import { isTextAttachment } from '../../../dist/domain/utils/attachment.utils.js';

test('note chunking includes attachment metadata so ask can retrieve attached files', () => {
  const mockRuntimeEnv = {
    read: () => ({
      chunkTargetTokens: 512,
      chunkOverlapTokens: 64,
      chunkMinChars: 100,
      chunkCodeBlockOverlapLines: 3,
    }),
  };
  const chunks = new NoteChunkingService(mockRuntimeEnv).chunkNote({
    title: 'Deploy checklist',
    projectSlug: 'n8n-automations',
    body: 'Checklist curto',
    attachments: [
      {
        fileName: 'FéConect-52e25237-dd8a-4511-ba6b-1e394674930f (11).pdf',
        mimeType: 'application/pdf',
        sizeBytes: 2048,
      },
      {
        fileName: 'erro.png',
        mimeType: 'image/png',
        sizeBytes: 11,
      },
    ],
  });

  assert.equal(chunks.length, 1);
  assert.match(chunks[0].chunkText, /Attachments:/);
  assert.match(chunks[0].chunkText, /FéConect-52e25237-dd8a-4511-ba6b-1e394674930f \(11\)\.pdf/);
  assert.match(chunks[0].chunkText, /application\/pdf/);
  assert.match(chunks[0].chunkText, /2 KB/);
  assert.match(chunks[0].chunkText, /erro\.png/);
  assert.match(chunks[0].chunkText, /image\/png/);
});

test('isTextAttachment detects text mime types and extensions correctly', () => {
  assert.equal(isTextAttachment('text/plain', 'notes.txt'), true);
  assert.equal(isTextAttachment('text/markdown', 'readme.md'), true);
  assert.equal(isTextAttachment('application/json', 'config.json'), true);
  assert.equal(isTextAttachment('application/octet-stream', 'script.py'), true);
  assert.equal(isTextAttachment('application/octet-stream', 'data.csv'), true);
  assert.equal(isTextAttachment('application/pdf', 'document.pdf'), false);
  assert.equal(isTextAttachment('image/png', 'photo.png'), false);

  // Excluded formats (log, html, htm, xml)
  assert.equal(isTextAttachment('text/x-log', 'app.log'), false);
  assert.equal(isTextAttachment('text/html', 'index.html'), false);
  assert.equal(isTextAttachment('text/xml', 'data.xml'), false);
  assert.equal(isTextAttachment('application/xml', 'config.xml'), false);
  assert.equal(isTextAttachment('application/octet-stream', 'page.htm'), false);
});

test('note chunking includes text attachment content in separate contextual chunks', () => {
  const mockRuntimeEnv = {
    read: () => ({
      chunkTargetTokens: 512,
      chunkOverlapTokens: 64,
      chunkMinChars: 50,
      chunkCodeBlockOverlapLines: 3,
    }),
  };

  const chunks = new NoteChunkingService(mockRuntimeEnv).chunkNote({
    title: 'Projeto Alpha',
    projectSlug: 'alpha-proj',
    path: 'docs/spec.md',
    body: 'Esta nota descreve a arquitetura geral do projeto Alpha e suas especificações técnicas.',
    attachments: [
      {
        fileName: 'instrucoes.txt',
        mimeType: 'text/plain',
        sizeBytes: 350,
        content: 'Passo 1: Instalar dependências. Passo 2: Executar migrações do banco. Passo 3: Iniciar o servidor em modo dev.',
      },
      {
        fileName: 'relatorio.csv',
        mimeType: 'text/csv',
        sizeBytes: 150,
        content: 'id,nome,valor\n1,Serviço A,100\n2,Serviço B,200\n3,Serviço C,300',
      },
    ],
  });

  // 1 chunk para o corpo da nota + 1 chunk por anexo de texto = 3 chunks
  assert.equal(chunks.length, 3);
  assert.equal(chunks[0].chunkIndex, 0);
  assert.match(chunks[0].chunkText, /Projeto Alpha/);
  assert.match(chunks[0].chunkText, /arquitetura geral/);

  assert.equal(chunks[1].chunkIndex, 1);
  assert.match(chunks[1].chunkText, /Attachment: instrucoes\.txt/);
  assert.match(chunks[1].chunkText, /Instalar dependências/);

  assert.equal(chunks[2].chunkIndex, 2);
  assert.match(chunks[2].chunkText, /Attachment: relatorio\.csv/);
  assert.match(chunks[2].chunkText, /Serviço A/);
});

