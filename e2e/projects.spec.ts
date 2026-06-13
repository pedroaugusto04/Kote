import { test, expect } from '@playwright/test';

test.describe('Projects and Notes Management', () => {
  test('should load the projects page', async ({ page }) => {
    const response = await page.goto('/projects');
    expect(response?.status()).toBeLessThan(400);
  });

  test('should load the vault page', async ({ page }) => {
    const response = await page.goto('/vault');
    expect(response?.status()).toBeLessThan(400);
  });
});
