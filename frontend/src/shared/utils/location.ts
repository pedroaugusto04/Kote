import { COUNTRY_CODE } from '../constants/billing.constants';

/**
 * Detect user country code based on system/browser settings (timezone, locale)
 */
export function detectUserCountry(): 'BR' | 'US' {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const brTimeZones = [
      'America/Sao_Paulo', 'America/Recife', 'America/Manaus', 'America/Fortaleza',
      'America/Belem', 'America/Araguaina', 'America/Bahia', 'America/Boa_Vista',
      'America/Campo_Grande', 'America/Cuiaba', 'America/Maceio', 'America/Noronha',
      'America/Porto_Velho', 'America/Rio_Branco'
    ];
    if (brTimeZones.includes(tz) || tz?.startsWith('Brazil/')) {
      return COUNTRY_CODE.BRAZIL;
    }
  } catch (e) {
    // ignore
  }

  if (
    navigator.language === 'pt-BR' ||
    navigator.language === 'pt' ||
    (navigator.languages && (navigator.languages.includes('pt-BR') || navigator.languages.includes('pt')))
  ) {
    return COUNTRY_CODE.BRAZIL;
  }

  return COUNTRY_CODE.UNITED_STATES;
}
