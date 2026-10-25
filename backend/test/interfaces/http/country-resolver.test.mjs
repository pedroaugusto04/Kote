import test from 'node:test';
import assert from 'node:assert/strict';

import { resolveUserCountryCode } from '../../../dist/interfaces/http/helpers/country-resolver.js';
import { COUNTRY_CODE } from '../../../dist/domain/constants/billing.constants.js';

test('resolveUserCountryCode prioritizes customCountryCode when provided', () => {
  const result = resolveUserCountryCode({
    customCountryCode: 'ca',
    userCountryHeader: 'BR',
    cfCountryHeader: 'US',
    acceptLanguageHeader: 'pt-BR,pt;q=0.9',
  });
  assert.equal(result, 'CA');
});

test('resolveUserCountryCode uses userCountryHeader if no customCountryCode', () => {
  const result = resolveUserCountryCode({
    userCountryHeader: 'jp',
    cfCountryHeader: 'US',
    acceptLanguageHeader: 'pt-BR,pt;q=0.9',
  });
  assert.equal(result, 'JP');
});

test('resolveUserCountryCode uses cfCountryHeader if no userCountryHeader', () => {
  const result = resolveUserCountryCode({
    cfCountryHeader: 'de',
    acceptLanguageHeader: 'pt-BR,pt;q=0.9',
  });
  assert.equal(result, 'DE');
});

test('resolveUserCountryCode infers Brazil from pt-br acceptLanguageHeader', () => {
  const result = resolveUserCountryCode({
    acceptLanguageHeader: 'pt-BR,pt;q=0.9,en-US;q=0.8',
  });
  assert.equal(result, COUNTRY_CODE.BRAZIL);
});

test('resolveUserCountryCode defaults to US when no indicators present', () => {
  const result = resolveUserCountryCode({});
  assert.equal(result, COUNTRY_CODE.UNITED_STATES);
});
