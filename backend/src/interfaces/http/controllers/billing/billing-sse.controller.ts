import { Controller, Get, Query, UseGuards, Sse, MessageEvent } from '@nestjs/common';
import { Observable } from 'rxjs';
import { BillingSseHub } from '../../../../infrastructure/billing/sse/BillingSseHub.js';
import { AccessTokenAuthGuard } from '../../auth.guards.js';

@Controller('billing')
@UseGuards(AccessTokenAuthGuard)
export class BillingSseController {
  constructor(private readonly billingSseHub: BillingSseHub) {}

  @Sse('sse')
  billingSse(@Query('userId') userId: string): Observable<MessageEvent> {
    if (!userId) {
      throw new Error('userId query parameter is required');
    }

    return new Observable<MessageEvent>((observer) => {
      // Send initial connection message
      observer.next({
        type: 'connected',
        data: { userId },
      });

      // Create a mock response object that the hub can use
      const mockResponse = {
        write: (data: string) => {
          observer.next({
            type: 'subscription_status',
            data: JSON.parse(data.replace(/^event: subscription_status\n|data: /g, '').replace(/\n\n$/, '')),
          });
        },
        writableEnded: false,
        destroyed: false,
      } as any;

      // Add client to hub
      this.billingSseHub.addClient(userId, mockResponse);

      // Cleanup on unsubscribe
      return () => {
        this.billingSseHub.removeClient(userId, mockResponse);
      };
    });
  }
}
