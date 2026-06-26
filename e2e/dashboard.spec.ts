import { test, expect } from '@playwright/test';

test.describe('Dashboard', () => {
  test('should load the application', async ({ page }) => {
    const response = await page.goto('/');
    expect(response?.status()).toBeLessThan(400);
  });

  test('should navigate to Projects page', async ({ page }) => {
    const response = await page.goto('/projects');
    expect(response?.status()).toBeLessThan(400);
  });

  test('should navigate to Ask AI page', async ({ page }) => {
    const response = await page.goto('/search');
    expect(response?.status()).toBeLessThan(400);
  });

  test('should navigate to Reminders page', async ({ page }) => {
    const response = await page.goto('/reminders');
    expect(response?.status()).toBeLessThan(400);
  });

  test('should navigate to Map page', async ({ page }) => {
    const response = await page.goto('/map');
    expect(response?.status()).toBeLessThan(400);
  });
});
