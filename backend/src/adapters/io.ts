export async function readJsonInput(fileArg = ''): Promise<unknown> {
  if (fileArg) {
    throw new Error('file_input_removed_use_http_api');
  }
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)));
  }
  const raw = Buffer.concat(chunks).toString('utf8').trim();
  return raw ? JSON.parse(raw) : {};
}

export function writeJsonOutput(payload: unknown): void {
  process.stdout.write(`${JSON.stringify(payload)}\n`);
}
