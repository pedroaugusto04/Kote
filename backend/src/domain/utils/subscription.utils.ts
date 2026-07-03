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

export interface SubscriptionPeriodInfo {
  currentPeriodStart: string | Date;
  currentPeriodEnd: string | Date;
  billingCycle?: BillingCycle | string;
  plan?: {
    billingPeriod?: BillingCycle | string;
  };
}

export function getQuotaPeriod(
  activeSub: SubscriptionPeriodInfo,
  now = new Date(),
): { start: Date; end: Date } {
  const start = new Date(activeSub.currentPeriodStart);
  const end = new Date(activeSub.currentPeriodEnd);

  const isYearly = activeSub.billingCycle === BillingCycle.YEARLY ||
                   activeSub.plan?.billingPeriod === BillingCycle.YEARLY ||
                   (end.getTime() - start.getTime()) > 35 * 24 * 60 * 60 * 1000;

  if (!isYearly) {
    return { start, end };
  }

  if (now < start) {
    const firstEnd = addMonths(start, 1);
    return { start, end: firstEnd > end ? end : firstEnd };
  }

  if (now >= end) {
    const lastStart = addMonths(end, -1);
    return { start: lastStart < start ? start : lastStart, end };
  }

  const monthsDiff = (now.getFullYear() - start.getFullYear()) * 12 + (now.getMonth() - start.getMonth());

  let candidateStart = addMonths(start, monthsDiff);
  let candidateEnd = addMonths(start, monthsDiff + 1);

  if (now >= candidateStart && now < candidateEnd) {
    return {
      start: candidateStart,
      end: candidateEnd > end ? end : candidateEnd,
    };
  }

  candidateStart = addMonths(start, monthsDiff - 1);
  candidateEnd = addMonths(start, monthsDiff);
  return {
    start: candidateStart,
    end: candidateEnd > end ? end : candidateEnd,
  };
}

export function addMonths(date: Date, months: number): Date {
  const result = new Date(date);
  const targetMonth = result.getMonth() + months;
  result.setMonth(targetMonth);
  const expectedMonth = ((targetMonth % 12) + 12) % 12;
  if (result.getMonth() !== expectedMonth) {
    result.setDate(0);
  }
  return result;
}

