import { BillingCycle } from '../enums/billing.enums.js';

function getDaysInMonthUtc(year: number, month0: number): number {
  return new Date(Date.UTC(year, month0 + 1, 0)).getUTCDate();
}

export function getNextDueDate(activationDate: Date, billingCycle: BillingCycle): Date {
  const effectiveDate = Number.isNaN(activationDate.getTime()) ? new Date() : activationDate;
  const year = effectiveDate.getUTCFullYear();
  const month = effectiveDate.getUTCMonth();
  const day = effectiveDate.getUTCDate();

  if (billingCycle === BillingCycle.YEARLY) {
    const targetYear = year + 1;
    const daysInTargetMonth = getDaysInMonthUtc(targetYear, month);
    const safeDay = Math.min(day, daysInTargetMonth);
    return new Date(Date.UTC(targetYear, month, safeDay, 0, 0, 0, 0));
  }

  const targetMonthRaw = month + 1;
  const targetYear = year + Math.floor(targetMonthRaw / 12);
  const targetMonth = targetMonthRaw % 12;
  const daysInTargetMonth = getDaysInMonthUtc(targetYear, targetMonth);
  const safeDay = Math.min(day, daysInTargetMonth);

  return new Date(Date.UTC(targetYear, targetMonth, safeDay, 0, 0, 0, 0));
}

export function formatGatewayDueDate(date: Date): string {
  return date.toISOString().split('T')[0];
}
