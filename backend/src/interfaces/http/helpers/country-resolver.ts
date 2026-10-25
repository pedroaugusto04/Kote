import { COUNTRY_CODE } from '../../../domain/constants/billing.constants.js';

export interface ResolveCountryOptions {
  customCountryCode?: string;
  userCountryHeader?: string;
  cfCountryHeader?: string;
  acceptLanguageHeader?: string;
}

export function resolveUserCountryCode(options: ResolveCountryOptions = {}): string {
  const { customCountryCode, userCountryHeader, cfCountryHeader, acceptLanguageHeader } = options;

  if (customCountryCode && customCountryCode.trim().length > 0) {
    return customCountryCode.trim().toUpperCase();
  }
  if (userCountryHeader && userCountryHeader.trim().length > 0) {
    return userCountryHeader.trim().toUpperCase();
  }
  if (cfCountryHeader && cfCountryHeader.trim().length > 0) {
    return cfCountryHeader.trim().toUpperCase();
  }
  if (acceptLanguageHeader && acceptLanguageHeader.toLowerCase().includes('pt-br')) {
    return COUNTRY_CODE.BRAZIL;
  }
  return COUNTRY_CODE.UNITED_STATES;
}
