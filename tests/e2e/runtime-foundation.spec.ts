import { expect, test } from '@playwright/test';

const runtimeBaseUrl =
  process.env.E2E_RUNTIME_BASE_URL ?? 'http://127.0.0.1:5174';

test('运行时只有 Canvas 没有编辑面板', async ({ page }) => {
  test.setTimeout(60_000);
  const document = {
    schemaVersion: 1,
    id: 'local-scene',
    projectId: 'local-project',
    name: '本地运行场景',
    revision: 0,
    rootNodeIds: [],
    nodes: {},
    settings: {
      toneMapping: 'neutral',
      shadowMapType: 'pcf',
      exposure: 1,
      backgroundType: 'color',
      background: '#111827',
      backgroundAssetId: null,
      backgroundBlurriness: 0,
      backgroundIntensity: 5,
      environmentEnabled: false,
      environmentAssetId: null,
      fogType: 'none',
      fogColor: '#3b3b3b',
      fogNear: 1,
      fogFar: 200,
      fogDensity: 0.01,
      groundType: 'none',
      gridVisible: false,
      weatherType: 'none',
      weatherCount: 2_000,
      weatherSpeed: 0.4,
      weatherOpacity: 0.6,
      weatherSize: 0.5,
      weatherArea: 100,
      weatherHeight: 50,
    },
    interactions: [],
    dataSources: [],
    socketTasks: [],
    assetReferences: [],
  };
  // 基础冒烟不启动数据库，只在浏览器边界提供一份通过共享协议的空发布包。
  await page.route('**/api/publications/local-publication/manifest', (route) =>
    route.fulfill({
      json: {
        schemaVersion: 1,
        publicationId: 'local-publication',
        projectId: 'local-project',
        sceneId: 'local-scene',
        releaseId: 'local-release',
        contentHash: 'local-content-hash',
        document,
        assets: {},
      },
    }),
  );
  await page.goto(`${runtimeBaseUrl}/runtime/local-publication`);

  const canvasHost = page.getByTestId('runtime-canvas');
  // 全量真实后端 E2E 并行时 Vite 会冷编译完整 Three.js 模块图，按就绪条件等待而非依赖默认 5 秒。
  await expect(canvasHost).toHaveAttribute('data-runtime-ready', 'true', {
    timeout: 30_000,
  });
  await expect(canvasHost.locator('canvas')).toHaveCount(1);
  await expect(page.getByTestId('asset-panel')).toHaveCount(0);
  await expect(page.getByTestId('inspector-panel')).toHaveCount(0);
});
