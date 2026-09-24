import { BadRequestException } from '@nestjs/common';

export type BillingIntentExternalReferenceType = 'new' | 'upgrade' | 'change_cycle';

export type ParsedBillingIntentExternalReference = {
  type: BillingIntentExternalReferenceType;
  billingIntentId: string;
};

export function buildExternalReference(
  type: BillingIntentExternalReferenceType,
  billingIntentId: string,
): string {
  if (!type) throw new Error('type is required for externalReference');
  if (!billingIntentId) throw new Error('billingIntentId is required for externalReference');

  return new URLSearchParams({
    t: type,
    id: billingIntentId,
  }).toString();
}

export function parseExternalReference(ref?: string | null): ParsedBillingIntentExternalReference {
  if (!ref) throw new BadRequestException('external_reference_missing');

  const params = new URLSearchParams(ref);
  const type = params.get('t') as BillingIntentExternalReferenceType | null;
  const billingIntentId = params.get('id');

  if (!type || !billingIntentId) throw new BadRequestException('external_reference_invalid');

  return { type, billingIntentId };
}
