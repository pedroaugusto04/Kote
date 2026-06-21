/**
 * CPF/CNPJ validation and formatting utilities
 */

/**
 * Formats CPF/CNPJ with mask
 * CPF: 000.000.000-00
 * CNPJ: 00.000.000/0000-00
 */
export function formatCpfCnpj(value: string): string {
  const clean = value.replace(/\D/g, '');
  if (clean.length <= 11) {
    // CPF mask: 000.000.000-00
    return clean
      .replace(/(\d{3})(\d)/, '$1.$2')
      .replace(/(\d{3})(\d)/, '$1.$2')
      .replace(/(\d{3})(\d{1,2})$/, '$1-$2');
  } else {
    // CNPJ mask: 00.000.000/0000-00
    return clean
      .replace(/(\d{2})(\d)/, '$1.$2')
      .replace(/(\d{3})(\d)/, '$1.$2')
      .replace(/(\d{3})(\d)/, '$1/$2')
      .replace(/(\d{4})(\d{1,2})$/, '$1-$2');
  }
}

/**
 * Validates CPF format (basic check)
 * Returns true if CPF has 11 digits
 */
export function isValidCpfFormat(value: string): boolean {
  const clean = value.replace(/\D/g, '');
  return clean.length === 11;
}

/**
 * Validates CNPJ format (basic check)
 * Returns true if CNPJ has 14 digits
 */
export function isValidCnpjFormat(value: string): boolean {
  const clean = value.replace(/\D/g, '');
  return clean.length === 14;
}

/**
 * Validates CPF/CNPJ format
 * Returns true if value is either a valid CPF (11 digits) or CNPJ (14 digits)
 */
export function isValidCpfCnpjFormat(value: string): boolean {
  const clean = value.replace(/\D/g, '');
  return clean.length === 11 || clean.length === 14;
}

/**
 * Detects if a CPF/CNPJ value is CPF or CNPJ based on digit count
 */
export function detectCpfCnpjType(value: string): 'cpf' | 'cnpj' | null {
  const clean = value.replace(/\D/g, '');
  if (clean.length === 11) return 'cpf';
  if (clean.length === 14) return 'cnpj';
  return null;
}
