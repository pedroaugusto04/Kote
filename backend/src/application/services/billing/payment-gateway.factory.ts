import { Inject, Injectable } from '@nestjs/common';
import {
  ASAAS_PAYMENT_GATEWAY,
  ASAAS_STATUS_MAPPER,
  GatewayNameEnum,
  STRIPE_PAYMENT_GATEWAY,
  STRIPE_STATUS_MAPPER,
  IGatewayStatusMapper,
  IPaymentGateway,
} from '../../ports/billing/payment-gateway.port.js';

@Injectable()
export class PaymentGatewayFactory {
  constructor(
    @Inject(ASAAS_PAYMENT_GATEWAY) private readonly asaasGateway: IPaymentGateway,
    @Inject(STRIPE_PAYMENT_GATEWAY) private readonly stripeGateway: IPaymentGateway,
    @Inject(ASAAS_STATUS_MAPPER) private readonly asaasStatusMapper: IGatewayStatusMapper,
    @Inject(STRIPE_STATUS_MAPPER) private readonly stripeStatusMapper: IGatewayStatusMapper,
  ) {}

  getGateway(gatewayName?: GatewayNameEnum | string | null): IPaymentGateway {
    const normalized = String(gatewayName || '').toLowerCase();
    if (normalized === 'stripe' || normalized === GatewayNameEnum.STRIPE.toLowerCase()) {
      return this.stripeGateway;
    }
    return this.asaasGateway;
  }

  getStatusMapper(gatewayName?: GatewayNameEnum | string | null): IGatewayStatusMapper {
    const normalized = String(gatewayName || '').toLowerCase();
    if (normalized === 'stripe' || normalized === GatewayNameEnum.STRIPE.toLowerCase()) {
      return this.stripeStatusMapper;
    }
    return this.asaasStatusMapper;
  }
}
