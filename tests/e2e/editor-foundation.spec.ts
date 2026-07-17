import { expect, test } from '@playwright/test';
import { createDefaultSceneDocument } from '../../packages/scene-schema/src/index.js';

const apiBaseUrl = process.env.E2E_API_BASE_URL ?? 'http://127.0.0.1:3100/api';

test('编辑器工作台创建真实 WebGL Canvas', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  const pageErrors: string[] = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  // 使用不存在的场景 ID，避免本地已有数据库内容污染对象数量断言。
  await page.goto(`/editor/local-project/foundation-${Date.now()}`);
  await expect(page.getByTestId('top-toolbar')).toBeVisible();

  const canvasHost = page.getByTestId('editor-canvas');
  await expect(canvasHost).toHaveAttribute('data-engine-ready', 'true', {
    timeout: 30_000,
  });
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
  const viewportGizmo = page.locator('#editor-viewport-gizmo');
  await expect(viewportGizmo).toBeVisible();
  expect((await viewportGizmo.boundingBox())?.width).toBeCloseTo(90, 0);
  await page.locator('[data-tool="reset-camera"]').click();
  await expect(
    page.locator('.viewport-tools .transform-controls-item'),
  ).toHaveCount(8);

  await page.locator('[data-asset-category="geometry"]').click();
  const box = page.getByTestId('add-geometry-box');
  await expect(box).toHaveAttribute('draggable', 'true');
  await box.dragTo(canvasHost, { targetPosition: { x: 540, y: 430 } });
  await expect(canvasHost).toHaveAttribute(
    'data-scene-object-count',
    String(initialObjectCount + 1),
  );
  expect(Number(await page.getByLabel('位置 Y').inputValue())).toBe(0.5);
  await page.locator('[data-tool="align-ground"]').click();
  await expect(page.getByLabel('位置 Y')).toHaveValue('0.51');

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

  await page.locator('[data-tool="choose-all"]').click();
  await expect(page.locator('[data-tool="choose-all"]')).not.toHaveClass(
    /active/,
  );
  await page.locator('[data-tool="choose-all"]').click();
  await expect(page.locator('[data-tool="choose-all"]')).toHaveClass(/active/);
  await page.locator('[data-tool="measure"]').click();
  await expect(page.locator('.measurement-status')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('.measurement-status')).toHaveCount(0);
  expect(pageErrors).toEqual([]);
});

test('编辑器鼠标映射为左键平移、右键旋转', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto(`/editor/local-project/mouse-controls-${Date.now()}`);

  const canvasHost = page.getByTestId('editor-canvas');
  await expect(canvasHost).toHaveAttribute('data-engine-ready', 'true', {
    timeout: 30_000,
  });
  const canvas = canvasHost.locator('canvas');
  const bounds = await canvas.boundingBox();
  expect(bounds).not.toBeNull();
  if (!bounds) return;

  await page.getByTestId('scene-camera').click();
  const positionInputs = ['X', 'Y', 'Z'].map((axis) =>
    page.getByLabel(`相机位置 ${axis}`, { exact: true }),
  );
  const rotationInputs = ['X', 'Y', 'Z'].map((axis) =>
    page.getByLabel(`相机旋转 ${axis}（度）`, { exact: true }),
  );
  const readValues = (inputs: typeof positionInputs) =>
    Promise.all(inputs.map((input) => input.inputValue()));
  const initialPosition = await readValues(positionInputs);
  const center = {
    x: bounds.x + bounds.width / 2,
    y: bounds.y + bounds.height / 2,
  };

  // 左键映射为 Pan，应改变相机位置。
  await page.mouse.move(center.x, center.y);
  await page.mouse.down({ button: 'left' });
  await page.mouse.move(center.x + 120, center.y, { steps: 4 });
  await page.mouse.up({ button: 'left' });
  await expect
    .poll(async () => (await readValues(positionInputs)).join(','))
    .not.toBe(initialPosition.join(','));
  const rotationAfterPan = await readValues(rotationInputs);

  // 右键映射为 Rotate，应改变相机欧拉角；真实 Gizmo 会通过 OrbitControls 同步。
  await page.mouse.move(center.x, center.y);
  await page.mouse.down({ button: 'right' });
  await page.mouse.move(center.x + 120, center.y, { steps: 4 });
  await page.mouse.up({ button: 'right' });
  await expect
    .poll(async () => (await readValues(rotationInputs)).join(','))
    .not.toBe(rotationAfterPan.join(','));
});

test('Camera 配置和漫游路径支持撤销、保存并刷新恢复', async ({ page }) => {
  const sceneId = `camera-persistence-${Date.now()}`;
  const projectId = 'camera-persistence-project';
  let serverDocument = createDefaultSceneDocument(
    projectId,
    sceneId,
    'Camera 持久化验收',
  );
  const timestamp = new Date().toISOString();
  const sceneDetail = () => ({
    id: sceneId,
    projectId,
    name: serverDocument.name,
    sortOrder: 0,
    revision: serverDocument.revision,
    contentHash: `revision-${serverDocument.revision}`,
    coverKey: null,
    createdAt: timestamp,
    updatedAt: timestamp,
    document: serverDocument,
  });
  await page.route(`${apiBaseUrl}/scenes/${sceneId}`, (route) =>
    route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify(sceneDetail()),
    }),
  );
  await page.route(
    `${apiBaseUrl}/scenes/${sceneId}/document`,
    async (route) => {
      const payload = route.request().postDataJSON() as {
        baseRevision: number;
        document: typeof serverDocument;
      };
      expect(payload.baseRevision).toBe(serverDocument.revision);
      serverDocument = structuredClone(payload.document);
      serverDocument.revision += 1;
      await route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify(sceneDetail()),
      });
    },
  );

  await page.goto(`/editor/${projectId}/${sceneId}`);
  const canvasHost = page.getByTestId('editor-canvas');
  await expect(canvasHost).toHaveAttribute('data-engine-ready', 'true', {
    timeout: 30_000,
  });
  await expect(page.getByTestId('top-toolbar')).toContainText('已保存');
  await page.getByTestId('scene-camera').click();
  const cameraX = page.getByLabel('相机位置 X', { exact: true });
  await expect(cameraX).toHaveValue('0.607');

  await cameraX.fill('2.5');
  await cameraX.press('Tab');
  await expect(page.getByTestId('undo-scene')).toBeEnabled();
  await page.getByTestId('undo-scene').click();
  await expect(cameraX).toHaveValue('0.607');
  await page.getByTestId('redo-scene').click();
  await expect(cameraX).toHaveValue('2.5');

  await page.getByRole('tab', { name: '相机漫游' }).click();
  await page.getByRole('button', { name: '添加漫游路径' }).click();
  await expect(page.locator('.camera-roaming-viewport-status')).toContainText(
    'Ctrl / ⌘ + 左键定点',
  );
  const canvas = canvasHost.locator('canvas').first();
  const bounds = await canvas.boundingBox();
  expect(bounds).not.toBeNull();
  if (!bounds) return;
  await page.keyboard.down('Control');
  await canvas.click({
    position: { x: bounds.width * 0.4, y: bounds.height * 0.62 },
  });
  await canvas.click({
    position: { x: bounds.width * 0.65, y: bounds.height * 0.68 },
  });
  await page.keyboard.up('Control');
  await expect(page.locator('.camera-roaming-item')).toContainText('2 个点');

  const saveRequest = page.waitForRequest(
    (request) =>
      request.url() === `${apiBaseUrl}/scenes/${sceneId}/document` &&
      request.method() === 'PUT',
  );
  await page.getByTestId('save-scene').click();
  await saveRequest;
  await expect(page.getByTestId('top-toolbar')).toContainText('已保存');
  expect(serverDocument.camera.position[0]).toBe(2.5);
  expect(serverDocument.cameraRoamingList).toHaveLength(1);

  await page.reload();
  await expect(canvasHost).toHaveAttribute('data-engine-ready', 'true', {
    timeout: 30_000,
  });
  await page.getByTestId('scene-camera').click();
  await expect(page.getByLabel('相机位置 X', { exact: true })).toHaveValue(
    '2.5',
  );
  await page.getByRole('tab', { name: '相机漫游' }).click();
  await expect(page.locator('.camera-roaming-item')).toContainText('2 个点');
});
