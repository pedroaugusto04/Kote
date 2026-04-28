export function normalizeHeaders(headers: Record<string, string | string[] | undefined>): Record<string, string> {
  return Object.fromEntries(Object.entries(headers).map(([key, value]) => [key.toLowerCase(), Array.isArray(value) ? value.join(',') : String(value || '')]));
}

export function extractWhatsappExternalId(body: Record<string, unknown>): string {
  const data = body.data as Record<string, unknown> | undefined;
  const key = data?.key as Record<string, unknown> | undefined;
  return String(
    body.jid ||
      body.remoteJid ||
      body.chatId ||
      body.from ||
      key?.remoteJid ||
      data?.remoteJid ||
      data?.chatId ||
      '',
  ).trim();
}
