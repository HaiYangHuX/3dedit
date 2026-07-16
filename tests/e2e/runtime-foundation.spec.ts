import { expect, test } from '@playwright/test';

const runtimeBaseUrl =
  process.env.E2E_RUNTIME_BASE_URL ?? 'http://127.0.0.1:5174';

test('运行时只有 Canvas 没有编辑面板', async ({ page }) => {
  await page.goto(`${runtimeBaseUrl}/runtime/local-publication`);

  const canvasHost = page.getByTestId('runtime-canvas');
  await expect(canvasHost).toHaveAttribute('data-engine-ready', 'true');
  await expect(canvasHost.locator('canvas')).toHaveCount(1);
  await expect(page.getByTestId('asset-panel')).toHaveCount(0);
  await expect(page.getByTestId('inspector-panel')).toHaveCount(0);
});
