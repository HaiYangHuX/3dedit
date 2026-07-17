import { expect, test } from '@playwright/test';

test('编辑器工作台创建真实 WebGL Canvas', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  const pageErrors: string[] = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  // 使用不存在的场景 ID，避免本地已有数据库内容污染对象数量断言。
  await page.goto(`/editor/local-project/foundation-${Date.now()}`);
  await expect(page.getByTestId('top-toolbar')).toBeVisible();

  const canvasHost = page.getByTestId('editor-canvas');
  await expect(canvasHost).toHaveAttribute('data-engine-ready', 'true');
  await expect(canvasHost.locator('canvas')).toHaveCount(1);
  const initialObjectCount = Number(
    (await canvasHost.getAttribute('data-scene-object-count')) ?? '0',
  );

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

  await page.locator('[data-asset-category="geometry"]').click();
  const box = page.getByTestId('add-geometry-box');
  await expect(box).toHaveAttribute('draggable', 'true');
  await box.dragTo(canvasHost, { targetPosition: { x: 540, y: 430 } });
  await expect(canvasHost).toHaveAttribute(
    'data-scene-object-count',
    String(initialObjectCount + 1),
  );
  expect(Number(await page.getByLabel('位置 Y').inputValue())).toBe(0.5);

  await page.locator('[data-asset-category="light"]').click();
  const pointLight = page.getByTestId('add-light-point');
  await expect(pointLight).toHaveAttribute('draggable', 'true');
  await pointLight.dragTo(canvasHost, {
    targetPosition: { x: 220, y: 350 },
  });
  await expect(canvasHost).toHaveAttribute(
    'data-scene-object-count',
    String(initialObjectCount + 2),
  );
  expect(Number(await page.getByLabel('位置 Y').inputValue())).toBe(0.5);

  await page.getByTestId('undo-scene').click();
  await expect(canvasHost).toHaveAttribute(
    'data-scene-object-count',
    String(initialObjectCount + 1),
  );
  await page.getByTestId('redo-scene').click();
  await expect(canvasHost).toHaveAttribute(
    'data-scene-object-count',
    String(initialObjectCount + 2),
  );

  await page.getByRole('button', { name: '项目配置', exact: true }).click();
  await expect(page.locator('.project-settings-title')).toHaveText([
    '渲染器',
    '场景',
    '地面',
    '天气',
  ]);
  await expect(page.getByTestId('tone-mapping')).toContainText('Neutral');
  await expect(page.getByTestId('shadow-map')).toContainText('PCF阴影');
  await expect(page.getByTestId('environment-hint')).toContainText(
    '内置 Venice HDR',
  );
  await expect(
    page.getByTestId('environment-presets').locator('button'),
  ).toHaveCount(6);
  await page
    .getByTestId('environment-preset-builtin-environment-cathedral')
    .click();
  await expect(page.getByTestId('environment-preview')).toHaveAttribute(
    'src',
    /cathedral\.png$/,
  );
  // 项目配置复用检查器公共控件高度，不能比节点属性输入框更大。
  expect(
    (
      await page
        .getByTestId('ground-type')
        .locator('.el-select__wrapper')
        .boundingBox()
    )?.height,
  ).toBe(28);
  const settingsWidth = await page
    .locator('.scene-settings-inspector')
    .evaluate((element) => ({
      clientWidth: element.clientWidth,
      scrollWidth: element.scrollWidth,
    }));
  expect(settingsWidth.scrollWidth).toBe(settingsWidth.clientWidth);

  // 真实 WebGL 路径切换内置贴图地面和天气，可同时捕获资源路径与 shader 回归。
  await page.getByTestId('ground-type').click();
  await page.getByRole('option', { name: '地板', exact: true }).click();
  await expect(page.getByTestId('ground-type')).toContainText('地板');
  await page.getByTestId('weather-type').click();
  await page.getByRole('option', { name: '雨', exact: true }).click();
  await expect(page.getByTestId('weather-fields')).toBeVisible();
  await expect(page.getByTestId('weather-count')).toHaveAttribute(
    'aria-valuemax',
    '100000',
  );

  const downloadPromise = page.waitForEvent('download');
  await page.locator('[data-tool="screenshot"]').click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/\.png$/);
  expect(pageErrors).toEqual([]);
});
