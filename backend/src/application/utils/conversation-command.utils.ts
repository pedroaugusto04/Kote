function normalizedCommandText(text: string): string {
  return String(text || '').trim().toLowerCase();
}

export function isCancel(text: string): boolean {
  return ['cancelar', 'cancel', 'cancela', 'sair', 'exit', 'stop', '0'].includes(normalizedCommandText(text));
}

export function parseKnowledgeCommand(text: string): { query: string } | null {
  const commandMatch = String(text || '').trim().match(/^\/(buscar|consultar|perguntar|ask)\s+(.+)$/i);
  const query = String(commandMatch?.[2] || '').trim();
  return query ? { query } : null;
}
