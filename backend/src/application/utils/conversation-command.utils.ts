function normalizedCommandText(text: string): string {
  return String(text || '').trim().toLowerCase();
}

export function isCancel(text: string): boolean {
  return ['cancelar', 'cancel', 'cancela', 'sair', '0'].includes(normalizedCommandText(text));
}

export function isConfirm(text: string): boolean {
  return ['sim', 's', 'confirmar', '1', 'ok', 'enviar'].includes(normalizedCommandText(text));
}

export function isReject(text: string): boolean {
  return ['nao', 'n\u00e3o', 'n\u00c3\u00a3o', 'n', 'rejeitar', '2', 'descartar'].includes(normalizedCommandText(text));
}

export function isSkip(text: string): boolean {
  return ['pular', 'skip', 'nao', 'n\u00e3o', 'n\u00c3\u00a3o', 'n', '9', 'sem'].includes(normalizedCommandText(text));
}

export function parseKnowledgeCommand(text: string): { query: string } | null {
  const commandMatch = String(text || '').trim().match(/^\/(buscar|consultar|perguntar|ask)\s+(.+)$/i);
  const query = String(commandMatch?.[2] || '').trim();
  return query ? { query } : null;
}
