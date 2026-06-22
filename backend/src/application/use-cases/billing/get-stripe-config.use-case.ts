import { Injectable } from '@nestjs/common';

export type StripeConfigDTO = {
  publishableKey: string | null;
  configured: boolean;
  onlyStripe: boolean;
};

@Injectable()
export class GetStripeConfigUseCase {
  execute(): StripeConfigDTO {
    const publishableKey = process.env.STRIPE_PUBLISHABLE_KEY?.trim() || null;
    const configured = Boolean(process.env.STRIPE_SECRET_KEY?.trim()) && Boolean(publishableKey);
    const onlyStripe = process.env.ONLY_STRIPE === 'true';

    return {
      publishableKey,
      configured,
      onlyStripe,
    };
  }
}
