import test from 'node:test';
import assert from 'node:assert/strict';
import { QuotaService } from '../../../dist/application/services/quota.service.js';
import { QuotaResourceType } from '../../../dist/domain/enums/plans.enums.js';
import { BillingCycle } from '../../../dist/domain/enums/billing.enums.js';

test('QuotaService monthly slicing for annual plans', async (t) => {
  await t.test('correctly calculates the current monthly period for a yearly subscription (billingCycle = yearly)', async () => {
    const mockQuotaRepository = {
      async getSubscription(userId) {
        return {
          userId,
          planId: 'plan-pro',
          status: 'active',
          currentPeriodStart: '2026-03-15T00:00:00.000Z',
          currentPeriodEnd: '2027-03-15T00:00:00.000Z',
          gatewayName: 'stripe',
          gatewaySubscriptionId: 'sub_123',
          billingCycle: BillingCycle.YEARLY,
          createdAt: '2026-03-15T00:00:00.000Z',
          updatedAt: '2026-03-15T00:00:00.000Z',
          plan: {
            id: 'plan-pro',
            slug: 'pro',
            displayName: 'Pro Plan',
            description: 'Pro plan description',
            maxStorageBytes: 10 * 1024 * 1024 * 1024,
            maxAiCreditsPerMonth: 1000,
            maxWorkspaces: 5,
            maxProjectsPerWorkspace: 10,
            priceCents: 4900,
            billingPeriod: BillingCycle.YEARLY,
            isActive: true,
            createdAt: '2026-03-15T00:00:00.000Z',
            updatedAt: '2026-03-15T00:00:00.000Z',
          },
        };
      },
      async getActiveAdjustments() {
        return [];
      },
      async getCurrentUsage(userId, type, start, end) {
        this.lastStart = start;
        this.lastEnd = end;
        return 150;
      },
      lastStart: null,
      lastEnd: null,
    };

    const mockUserRepository = {
      async findUserById() {
        return { cpfCnpj: '12345678900' };
      },
    };

    const service = new QuotaService(mockQuotaRepository, mockUserRepository);

    const originalDate = global.Date;
    
    const setMockDate = (isoString) => {
      const mockTime = new Date(isoString).getTime();
      global.Date = class extends originalDate {
        constructor(...args) {
          if (args.length === 0) {
            return new originalDate(mockTime);
          }
          return new originalDate(...args);
        }
        static now() {
          return mockTime;
        }
      };
    };

    try {
      // 1. Current date is 2026-07-03T10:00:00.000Z
      // Expected monthly cycle: 2026-06-15 to 2026-07-15
      setMockDate('2026-07-03T10:00:00.000Z');
      
      const result = await service.checkQuota('user-1', QuotaResourceType.AI_REQUEST, 10);
      
      assert.equal(result.limit, 1000);
      assert.equal(result.current, 150);
      assert.equal(result.allowed, true);
      
      assert.equal(mockQuotaRepository.lastStart.toISOString(), '2026-06-15T00:00:00.000Z');
      assert.equal(mockQuotaRepository.lastEnd.toISOString(), '2026-07-15T00:00:00.000Z');

      // Test status
      const status = await service.getQuotaStatus('user-1');
      assert.equal(status.currentPeriodEnd, '2026-07-15T00:00:00.000Z');

      // 2. Current date: 2026-03-20T10:00:00.000Z (first month)
      // Expected monthly cycle: 2026-03-15 to 2026-04-15
      setMockDate('2026-03-20T10:00:00.000Z');
      await service.checkQuota('user-1', QuotaResourceType.AI_REQUEST, 10);
      assert.equal(mockQuotaRepository.lastStart.toISOString(), '2026-03-15T00:00:00.000Z');
      assert.equal(mockQuotaRepository.lastEnd.toISOString(), '2026-04-15T00:00:00.000Z');

      // 3. Current date before start
      setMockDate('2026-03-10T10:00:00.000Z');
      await service.checkQuota('user-1', QuotaResourceType.AI_REQUEST, 10);
      assert.equal(mockQuotaRepository.lastStart.toISOString(), '2026-03-15T00:00:00.000Z');
      assert.equal(mockQuotaRepository.lastEnd.toISOString(), '2026-04-15T00:00:00.000Z');

      // 4. Current date after end
      setMockDate('2027-03-20T10:00:00.000Z');
      await service.checkQuota('user-1', QuotaResourceType.AI_REQUEST, 10);
      assert.equal(mockQuotaRepository.lastStart.toISOString(), '2027-02-15T00:00:00.000Z');
      assert.equal(mockQuotaRepository.lastEnd.toISOString(), '2027-03-15T00:00:00.000Z');

    } finally {
      global.Date = originalDate;
    }
  });

  await t.test('correctly handles month boundaries (e.g. Jan 31st)', async () => {
    const mockQuotaRepository = {
      async getSubscription(userId) {
        return {
          userId,
          planId: 'plan-pro',
          status: 'active',
          currentPeriodStart: '2026-01-31T00:00:00.000Z',
          currentPeriodEnd: '2027-01-31T00:00:00.000Z',
          gatewayName: 'stripe',
          gatewaySubscriptionId: 'sub_123',
          billingCycle: BillingCycle.YEARLY,
          createdAt: '2026-01-31T00:00:00.000Z',
          updatedAt: '2026-01-31T00:00:00.000Z',
          plan: {
            id: 'plan-pro',
            slug: 'pro',
            maxStorageBytes: 10 * 1024 * 1024 * 1024,
            maxAiCreditsPerMonth: 1000,
            maxWorkspaces: 5,
            maxProjectsPerWorkspace: 10,
            priceCents: 4900,
            billingPeriod: BillingCycle.YEARLY,
            isActive: true,
          },
        };
      },
      async getActiveAdjustments() { return []; },
      async getCurrentUsage(userId, type, start, end) {
        this.lastStart = start;
        this.lastEnd = end;
        return 0;
      },
    };

    const mockUserRepository = {
      async findUserById() { return {}; },
    };

    const service = new QuotaService(mockQuotaRepository, mockUserRepository);
    const originalDate = global.Date;

    const setMockDate = (isoString) => {
      const mockTime = new Date(isoString).getTime();
      global.Date = class extends originalDate {
        constructor(...args) {
          if (args.length === 0) return new originalDate(mockTime);
          return new originalDate(...args);
        }
        static now() { return mockTime; }
      };
    };

    try {
      // 1. Current date: 2026-02-15T10:00:00.000Z
      // Expected period: 2026-01-31 to 2026-02-28 (clamped since Feb has 28 days)
      setMockDate('2026-02-15T10:00:00.000Z');
      await service.checkQuota('user-1', QuotaResourceType.AI_REQUEST, 1);
      assert.equal(mockQuotaRepository.lastStart.toISOString(), '2026-01-31T00:00:00.000Z');
      assert.equal(mockQuotaRepository.lastEnd.toISOString(), '2026-02-28T00:00:00.000Z');

      // 2. Current date: 2026-03-05T10:00:00.000Z
      // Expected period: 2026-02-28 to 2026-03-31
      setMockDate('2026-03-05T10:00:00.000Z');
      await service.checkQuota('user-1', QuotaResourceType.AI_REQUEST, 1);
      assert.equal(mockQuotaRepository.lastStart.toISOString(), '2026-02-28T00:00:00.000Z');
      assert.equal(mockQuotaRepository.lastEnd.toISOString(), '2026-03-31T00:00:00.000Z');

    } finally {
      global.Date = originalDate;
    }
  });
});
