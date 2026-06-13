import { test, expect } from '@playwright/test';

test.describe('Ask AI Feature', () => {
  test('should load the Ask AI page', async ({ page }) => {
    const response = await page.goto('/search');
    expect(response?.status()).toBeLessThan(400);
  });
});
