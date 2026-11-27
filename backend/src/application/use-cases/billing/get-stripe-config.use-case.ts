import { Injectable } from '@nestjs/common';
import { RuntimeEnvironmentProvider } from '../../ports/observability/runtime-environment.port.js';

export type StripeConfigDTO = {
  publishableKey: string | null;
  configured: boolean;
  onlyStripe: boolean;
};

@Injectable()
export class GetStripeConfigUseCase {
  constructor(private readonly environmentProvider: RuntimeEnvironmentProvider) {}

  execute(): StripeConfigDTO {
    const env = this.environmentProvider.read();
    const publishableKey = env.stripePublishableKey || null;
    const configured = Boolean(env.stripeSecretKey) && Boolean(publishableKey);

    return {
      publishableKey,
      configured,
      onlyStripe: env.onlyStripe,
    };
  }
}
