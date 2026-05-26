function normalizedCommandText(text: string): string {
  return String(text || '').trim().toLowerCase();
}

export function isCancel(text: string): boolean {
  return ['cancelar', 'cancel', 'cancela', 'sair', 'exit', 'stop', '0'].includes(normalizedCommandText(text));
}

export function isAskReset(text: string): boolean {
  return /^\/ask\s+reset$/i.test(String(text || '').trim());
}

export function parseAskCommand(text: string): { question: string } | null {
  if (isAskReset(text)) return null;
  const commandMatch = String(text || '').trim().match(/^\/ask\s+(.+)$/i);
  const question = String(commandMatch?.[1] || '').trim();
  return question ? { question } : null;
}
