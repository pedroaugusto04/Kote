import { test, expect } from '@playwright/test';

test.describe('Integrations Setup', () => {
  test('should load the integrations settings page', async ({ page }) => {
    const response = await page.goto('/settings/integrations');
    expect(response?.status()).toBeLessThan(400);
  });
});
