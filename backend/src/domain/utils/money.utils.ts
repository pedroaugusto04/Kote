import Decimal from 'decimal.js';

/**
 * Escala de preço para cálculos monetários (2 casas decimais)
 */
export const PLAN_PRICE_SCALE = 2;
export const DEFAULT_MONEY_SCALE = 4;

export type MoneyInput = string | number;
type DecimalLikeInput = unknown;
type DecimalType = InstanceType<typeof Decimal>;

/**
 * Normaliza string de valor monetário
 */
function normalizeStringAmount(value: string, strictScale = true): string {
  const trimmed = value.trim();
  if (!trimmed) {
    return '0';
  }

  const pattern = strictScale ? /^-?\d+(?:[.,]\d{1,4})?$/ : /^-?\d+(?:[.,]\d+)?$/;
  if (!pattern.test(trimmed)) {
    return '0';
  }

  return trimmed.replace(',', '.');
}

/**
 * Parse de valor numérico para Decimal
 */
function parseNumberAmount(value: number): DecimalType {
  if (!Number.isFinite(value)) {
    return new Decimal(0);
  }
  return new Decimal(value.toString());
}

/**
 * Parse de valor monetário para Decimal
 */
export function parseMoneyDecimal(value: MoneyInput): DecimalType {
  if (typeof value === 'number') {
    return parseNumberAmount(value).toDecimalPlaces(DEFAULT_MONEY_SCALE, Decimal.ROUND_HALF_UP);
  }
  return new Decimal(normalizeStringAmount(value));
}

/**
 * Parse de valor decimal loose para Decimal
 */
function parseDecimalLoose(value: DecimalLikeInput): DecimalType {
  if (value === null || value === undefined) {
    return new Decimal(0);
  }

  if (value instanceof Decimal) {
    return value;
  }

  if (typeof value === 'number') {
    return parseNumberAmount(value);
  }

  if (typeof value === 'string') {
    return new Decimal(normalizeStringAmount(value, false));
  }

  if (typeof value === 'object' && value !== null && 'toString' in value && typeof value.toString === 'function') {
    return new Decimal(normalizeStringAmount(value.toString(), false));
  }

  return new Decimal(0);
}

/**
 * Converte valor para Decimal com escala especificada
 */
export function toMoneyDecimal(value: DecimalLikeInput, scale = DEFAULT_MONEY_SCALE): DecimalType {
  const decimal = parseDecimalLoose(value);
  return decimal.toDecimalPlaces(scale, Decimal.ROUND_HALF_UP);
}

/**
 * Converte valor para número JavaScript com escala especificada
 */
export function toMoneyNumber(value: DecimalLikeInput, scale = DEFAULT_MONEY_SCALE): number {
  return Number(toMoneyDecimal(value, scale).toFixed(scale));
}

/**
 * Compara dois valores monetários
 * @returns -1 se a < b, 0 se a === b, 1 se a > b
 */
export function compareMoney(left: DecimalLikeInput, right: DecimalLikeInput, scale = DEFAULT_MONEY_SCALE): number {
  return toMoneyDecimal(left, scale).comparedTo(toMoneyDecimal(right, scale));
}

/**
 * Verifica se dois valores monetários são iguais
 */
export function isSameMoney(left: DecimalLikeInput, right: DecimalLikeInput, scale = DEFAULT_MONEY_SCALE): boolean {
  return compareMoney(left, right, scale) === 0;
}

/**
 * Formata valor monetário como string
 */
export function formatMoneyDecimal(value: DecimalLikeInput, scale = DEFAULT_MONEY_SCALE): string {
  const decimal = parseDecimalLoose(value);
  return decimal.toDecimalPlaces(scale, Decimal.ROUND_HALF_UP).toFixed(scale);
}

/**
 * Normaliza um valor de billing para o formato correto
 */
export function normalizeBillingValue(value: unknown): number {
  return toMoneyNumber(value, PLAN_PRICE_SCALE);
}
