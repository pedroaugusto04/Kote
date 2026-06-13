import { test, expect } from '@playwright/test';

test.describe('Search Functionality', () => {
  test('should load the search page', async ({ page }) => {
    const response = await page.goto('/search');
    expect(response?.status()).toBeLessThan(400);
  });
});
