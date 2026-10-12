function normalizedCommandText(text: string): string {
  return String(text || '').trim().toLowerCase();
}

export function isCancel(text: string): boolean {
  return ['cancelar', 'cancel', 'cancela', '/clear', 'sair', 'exit', 'stop', '0'].includes(normalizedCommandText(text));
}
