import { Injectable } from '@nestjs/common';
import { IPaymentGateway, GatewayNameEnum } from '../../ports/billing/payment-gateway.port.js';
import { AsaasPaymentGateway } from '../../../infrastructure/billing/gateways/asaas/AsaasPaymentGateway.js';
import { StripePaymentGateway } from '../../../infrastructure/billing/gateways/stripe/StripePaymentGateway.js';
import { AsaasGatewayStatusMapper } from '../../../infrastructure/billing/gateways/asaas/AsaasGatewayStatusMapper.js';
import { StripeGatewayStatusMapper } from '../../../infrastructure/billing/gateways/stripe/StripeGatewayStatusMapper.js';
import { IGatewayStatusMapper } from '../../../infrastructure/billing/gateways/IGatewayStatusMapper.js';

@Injectable()
export class PaymentGatewayFactory {
  constructor(
    private readonly asaasGateway: AsaasPaymentGateway,
    private readonly stripeGateway: StripePaymentGateway,
    private readonly asaasStatusMapper: AsaasGatewayStatusMapper,
    private readonly stripeStatusMapper: StripeGatewayStatusMapper,
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
