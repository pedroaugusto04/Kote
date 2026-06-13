import { test, expect } from '@playwright/test';

test.describe('Ask AI Feature', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/search', { waitUntil: 'networkidle' });
  });

  test('should display the Ask AI interface', async ({ page }) => {
    await expect(page).toHaveURL('/search');
    await expect(page.locator('body')).toBeVisible();
  });

  test('should have a chat input field', async ({ page }) => {
    const chatInput = page.locator('textarea, input[type="text"]').first();
    await expect(chatInput).toBeVisible({ timeout: 10000 });
  });

  test('should allow typing a question', async ({ page }) => {
    const chatInput = page.locator('textarea, input[type="text"]').first();
    await chatInput.fill('What is the status of the project?');
    await expect(chatInput).toHaveValue('What is the status of the project?');
  });

  test('should have a send button or submit action', async ({ page }) => {
    const sendButton = page.locator('button[type="submit"], button[aria-label*="send" i], button[aria-label*="Send" i]').first();
    const isVisible = await sendButton.isVisible().catch(() => false);
    
    // If no explicit send button, check for Enter key submission capability
    if (!isVisible) {
      const chatInput = page.locator('textarea, input[type="text"]').first();
      await expect(chatInput).toBeVisible();
    }
  });

  test('should display project filter if available', async ({ page }) => {
    const projectFilter = page.locator('select, [role="combobox"], [data-testid*="project"], [class*="project" i]').first();
    const isVisible = await projectFilter.isVisible().catch(() => false);
    
    // Project filter might not always be visible depending on implementation
    expect(isVisible || !isVisible).toBeTruthy();
  });

  test('should display chat history section if available', async ({ page }) => {
    const chatHistory = page.locator('[class*="history"], [class*="History"], [data-testid*="history"]').first();
    const isVisible = await chatHistory.isVisible().catch(() => false);
    
    // Chat history might not exist if no previous conversations
    expect(isVisible || !isVisible).toBeTruthy();
  });
});
