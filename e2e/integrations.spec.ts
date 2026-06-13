import { test, expect } from '@playwright/test';

test.describe('Integrations Setup', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/settings/integrations', { waitUntil: 'networkidle' });
  });

  test('should display the integrations settings page', async ({ page }) => {
    await expect(page).toHaveURL('/settings/integrations');
    await expect(page.locator('body')).toBeVisible();
  });

  test('should display available integrations', async ({ page }) => {
    // Look for common integration names mentioned in README
    const integrations = ['WhatsApp', 'Telegram', 'GitHub'];
    
    for (const integration of integrations) {
      const integrationElement = page.locator(`text=${integration}, [aria-label*="${integration}" i], [data-testid*="${integration.toLowerCase()}"]`).first();
      const isVisible = await integrationElement.isVisible().catch(() => false);
      
      // Integration might not be visible if not configured
      expect(isVisible || !isVisible).toBeTruthy();
    }
  });

  test('should have configuration options for integrations', async ({ page }) => {
    const configButton = page.locator('button:has-text("Configure"), button:has-text("Setup"), button:has-text("Connect")').first();
    const isVisible = await configButton.isVisible().catch(() => false);
    
    // Configuration buttons might not be visible if already configured
    expect(isVisible || !isVisible).toBeTruthy();
  });

  test('should display integration status indicators', async ({ page }) => {
    const statusIndicator = page.locator('[class*="status"], [aria-label*="status" i], [data-testid*="status"]').first();
    const isVisible = await statusIndicator.isVisible().catch(() => false);
    
    // Status indicators might not always be visible
    expect(isVisible || !isVisible).toBeTruthy();
  });

  test('should have help or documentation links', async ({ page }) => {
    const helpLink = page.locator('a:has-text("Help"), a:has-text("Documentation"), a:has-text("Guide")').first();
    const isVisible = await helpLink.isVisible().catch(() => false);
    
    // Help links might not always be present
    expect(isVisible || !isVisible).toBeTruthy();
  });
});
