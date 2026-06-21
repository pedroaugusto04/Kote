import { BillingType } from '../../../domain/enums/billing.enums.js';
import { BillingTypeEnum } from '../gateways/IPaymentGateway.js';

/**
 * Maps domain BillingType enum to gateway BillingTypeEnum
 */
export function toGatewayBillingType(billingType: BillingType): BillingTypeEnum {
  switch (billingType) {
    case BillingType.CREDIT_CARD:
      return BillingTypeEnum.CREDIT_CARD;
    case BillingType.PIX:
      return BillingTypeEnum.PIX;
    case BillingType.BOLETO:
      return BillingTypeEnum.BOLETO;
    default:
      return BillingTypeEnum.CREDIT_CARD;
  }
}
