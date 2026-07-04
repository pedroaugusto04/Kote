import fs from 'node:fs';
import path from 'node:path';
import pc from 'picocolors';
import { text as clackText, isCancel, spinner } from '@clack/prompts';
import { client, ApiClientError } from '../client.js';

function getMimeType(filePath: string, buffer?: Buffer): string {
  const ext = path.extname(filePath).toLowerCase();
  const map: Record<string, string> = {
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.webp': 'image/webp',
    '.gif': 'image/gif',
    '.svg': 'image/svg+xml',
    '.pdf': 'application/pdf',
    '.txt': 'text/plain',
    '.md': 'text/markdown',
    '.json': 'application/json',
    '.csv': 'text/csv',
    '.log': 'text/plain',
    '.yaml': 'text/yaml',
    '.yml': 'text/yaml',
    '.xml': 'text/xml',
    '.js': 'application/javascript',
    '.ts': 'application/typescript',
    '.html': 'text/html',
    '.css': 'text/css',
    '.py': 'text/x-python',
    '.sh': 'text/x-shellscript',
  };
  
  if (map[ext]) return map[ext];

  if (buffer) {
    const limit = Math.min(buffer.length, 1024);
    let isBinary = false;
    for (let i = 0; i < limit; i++) {
      if (buffer[i] === 0) {
        isBinary = true;
        break;
      }
    }
    if (!isBinary) {
      return 'text/plain';
    }
  }

  return 'application/octet-stream';
}

export async function runNote(noteText: string, options: { file?: string; project?: string }): Promise<void> {
  let media: { fileName: string; mimeType: string; sizeBytes: number; dataBase64: string } | undefined;

  if (options.file) {
    const filePath = path.resolve(options.file);
    if (!fs.existsSync(filePath)) {
      console.error(pc.red(`Error: File not found at ${options.file}`));
      process.exit(1);
    }
    try {
      const stats = fs.statSync(filePath);
      const buffer = fs.readFileSync(filePath);
      media = {
        fileName: path.basename(filePath),
        mimeType: getMimeType(filePath, buffer),
        sizeBytes: stats.size,
        dataBase64: buffer.toString('base64'),
      };
    } catch (err: any) {
      console.error(pc.red(`Error reading file: ${err.message}`));
      process.exit(1);
    }
  }

  const s = spinner();
  s.start('Sending message to agent...');

  try {
    let response = await client.sendAgentMessage(noteText, media, options.project);
    
    // Clear media after first turn so we don't re-upload on subsequent clarification turns
    media = undefined;

    while (response) {
      const action = response.action;
      const replyText = response.replyText || '';

      if (action === 'submit') {
        s.stop(pc.green('Success!'));
        console.log('\n' + pc.cyan(replyText) + '\n');
        break;
      }

      if (action === 'cancel') {
        s.stop(pc.yellow('Cancelled'));
        console.log('\n' + pc.yellow(replyText) + '\n');
        break;
      }

      if (action === 'ask') {
        s.stop(pc.cyan('Clarification needed'));
        console.log('\n' + pc.magenta('✨ ' + replyText));

        const userReply = await clackText({
          message: 'Your reply:',
          validate: (val) => {
            if (!val || !val.trim()) return 'Reply cannot be empty. Type "cancel" to abort.';
            return;
          },
        });

        if (isCancel(userReply)) {
          s.start('Cancelling session...');
          response = await client.sendAgentMessage('cancel', undefined, options.project);
          continue;
        }

        s.start('Sending reply...');
        response = await client.sendAgentMessage(String(userReply), undefined, options.project);
      } else {
        // Fallback for unexpected states
        s.stop(pc.green('Response received'));
        console.log('\n' + replyText + '\n');
        break;
      }
    }
  } catch (error: any) {
    s.stop(pc.red('Error processing agent conversation'));
    if (error instanceof ApiClientError) {
      console.error(pc.red(`Error (${error.status}): ${(error.body as any)?.message || error.message}`));
    } else {
      console.error(pc.red(`Error: ${error.message || 'Failed to communicate with agent'}`));
    }
    process.exit(1);
  }
}
