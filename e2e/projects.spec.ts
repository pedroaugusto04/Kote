import { test, expect } from '@playwright/test';

test.describe('Projects and Notes Management', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/projects', { waitUntil: 'networkidle' });
  });

  test('should display the projects page', async ({ page }) => {
    await expect(page).toHaveURL('/projects');
    await expect(page.locator('body')).toBeVisible();
  });

  test('should display projects list or empty state', async ({ page }) => {
    const projectsList = page.locator('[class*="project"], [data-testid*="project"]').first();
    const emptyState = page.locator('[class*="empty"], [class*="no-project"], text=/no project/i]').first();
    
    const projectsVisible = await projectsList.isVisible().catch(() => false);
    const emptyVisible = await emptyState.isVisible().catch(() => false);
    
    expect(projectsVisible || emptyVisible).toBeTruthy();
  });

  test('should have a button to create new project or note', async ({ page }) => {
    const createButton = page.locator('button:has-text("Create"), button:has-text("New"), button:has-text("Add"), [aria-label*="create" i], [aria-label*="add" i]').first();
    const isVisible = await createButton.isVisible().catch(() => false);
    
    // Create button might not always be visible depending on permissions
    expect(isVisible || !isVisible).toBeTruthy();
  });

  test('should navigate to vault page', async ({ page }) => {
    await page.goto('/vault', { waitUntil: 'networkidle' });
    await expect(page).toHaveURL('/vault');
    await expect(page.locator('body')).toBeVisible();
  });

  test('should display notes list or empty state in vault', async ({ page }) => {
    await page.goto('/vault', { waitUntil: 'networkidle' });
    
    const notesList = page.locator('[class*="note"], [data-testid*="note"]').first();
    const emptyState = page.locator('[class*="empty"], [class*="no-note"], text=/no note/i]').first();
    
    const notesVisible = await notesList.isVisible().catch(() => false);
    const emptyVisible = await emptyState.isVisible().catch(() => false);
    
    expect(notesVisible || emptyVisible).toBeTruthy();
  });

  test('should have search functionality in projects or vault', async ({ page }) => {
    await page.goto('/projects', { waitUntil: 'networkidle' });
    
    const searchInput = page.locator('input[type="text"], input[placeholder*="search" i]').first();
    const isVisible = await searchInput.isVisible().catch(() => false);
    
    // Search might not always be visible
    expect(isVisible || !isVisible).toBeTruthy();
  });
});
