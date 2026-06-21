import { Injectable } from '@nestjs/common';
import { Subject } from 'rxjs';

@Injectable()
export class BillingEventBus {
  private readonly subject = new Subject<string>(); // Emits userId

  emit(userId: string) {
    this.subject.next(userId);
  }

  getEvents() {
    return this.subject.asObservable();
  }
}
