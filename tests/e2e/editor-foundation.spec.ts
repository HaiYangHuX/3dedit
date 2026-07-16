import { expect, test } from '@playwright/test';

test('编辑器工作台创建真实 WebGL Canvas', async ({ page }) => {
  await page.goto('/editor/local-project/local-scene');
  await expect(page.getByTestId('top-toolbar')).toBeVisible();

  const canvasHost = page.getByTestId('editor-canvas');
  await expect(canvasHost).toHaveAttribute('data-engine-ready', 'true');
  await expect(canvasHost.locator('canvas')).toHaveCount(1);
});
