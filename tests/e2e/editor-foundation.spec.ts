import { expect, test } from '@playwright/test';

test('编辑器工作台创建真实 WebGL Canvas', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto('/editor/local-project/local-scene');
  await expect(page.getByTestId('top-toolbar')).toBeVisible();

  const canvasHost = page.getByTestId('editor-canvas');
  await expect(canvasHost).toHaveAttribute('data-engine-ready', 'true');
  await expect(canvasHost.locator('canvas')).toHaveCount(1);

  const toolbar = await page.getByTestId('top-toolbar').boundingBox();
  const assetPanel = await page.getByTestId('asset-panel').boundingBox();
  const inspector = await page.getByTestId('inspector-panel').boundingBox();
  const viewport = await page.locator('.viewport-shell').boundingBox();
  const viewportTools = await page.locator('.viewport-tools').boundingBox();
  expect(toolbar?.height).toBeCloseTo(33, 0);
  expect(assetPanel?.width).toBeCloseTo(180, 0);
  expect(inspector?.width).toBeCloseTo(340, 0);
  expect(viewport?.width).toBeCloseTo(760, 0);
  expect(viewportTools?.width).toBeLessThan(340);

  await expect(page.getByTestId('viewport-stats')).toBeVisible();
  await expect(page.getByTestId('viewport-gizmo')).toBeVisible();
  await page.locator('[data-view="front"]').click({ force: true });
  await page.locator('[data-tool="reset-camera"]').click();

  const downloadPromise = page.waitForEvent('download');
  await page.locator('[data-tool="screenshot"]').click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/\.png$/);
});
