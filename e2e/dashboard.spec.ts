import { test, expect } from '@playwright/test';

test.describe('Dashboard', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/', { waitUntil: 'networkidle' });
  });

  test('should display the dashboard page', async ({ page }) => {
    await expect(page).toHaveTitle(/Knowledge Vault|Home/i);
    await expect(page.locator('body')).toBeVisible();
  });

  test('should display navigation items', async ({ page }) => {
    const navItems = ['Home', 'Projects', 'Ask AI', 'Kanban', 'Reminders', 'Map'];
    
    for (const item of navItems) {
      const navLink = page.getByRole('link', { name: item }).first();
      await expect(navLink).toBeVisible({ timeout: 10000 });
    }
  });

  test('should navigate to Projects page', async ({ page }) => {
    const projectsLink = page.getByRole('link', { name: 'Projects' }).first();
    await projectsLink.click();
    await page.waitForURL('/projects', { timeout: 15000 });
    await expect(page).toHaveURL('/projects');
  });

  test('should navigate to Ask AI page', async ({ page }) => {
    const askAiLink = page.getByRole('link', { name: 'Ask AI' }).first();
    await askAiLink.click();
    await page.waitForURL('/search', { timeout: 15000 });
    await expect(page).toHaveURL('/search');
  });

  test('should navigate to Kanban page', async ({ page }) => {
    const kanbanLink = page.getByRole('link', { name: 'Kanban' }).first();
    await kanbanLink.click();
    await page.waitForURL('/kanban', { timeout: 15000 });
    await expect(page).toHaveURL('/kanban');
  });

  test('should navigate to Reminders page', async ({ page }) => {
    const remindersLink = page.getByRole('link', { name: 'Reminders' }).first();
    await remindersLink.click();
    await page.waitForURL('/reminders', { timeout: 15000 });
    await expect(page).toHaveURL('/reminders');
  });

  test('should navigate to Map page', async ({ page }) => {
    const mapLink = page.getByRole('link', { name: 'Map' }).first();
    await mapLink.click();
    await page.waitForURL('/map', { timeout: 15000 });
    await expect(page).toHaveURL('/map');
  });
});
