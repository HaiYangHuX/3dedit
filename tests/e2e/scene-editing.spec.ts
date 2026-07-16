import { expect, test } from '@playwright/test';
import { createMinimalGlb } from './fixtures/minimalGlb';

const apiBaseUrl = process.env.E2E_API_BASE_URL ?? 'http://127.0.0.1:3100/api';

test.skip(
  process.env.E2E_DATABASE !== 'true',
  '真实场景编辑验收需要 PostgreSQL、Redis、MinIO 和 asset-worker',
);

test('上传模型、多实例编辑、灯光、撤销重做与刷新还原闭环', async ({
  page,
  request,
}) => {
  test.setTimeout(150_000);
  const unique = String(Date.now());
  const fileName = `scene-pump-${unique}.glb`;
  const assetName = fileName.replace(/\.glb$/, '');
  let assetId = '';
  let projectId = '';

  try {
    await page.goto('/assets');
    await page.locator('input[type="file"]').setInputFiles({
      name: fileName,
      mimeType: 'model/gltf-binary',
      buffer: createMinimalGlb(unique),
    });
    const managementCard = page
      .locator('.asset-card')
      .filter({ hasText: assetName });
    await expect(managementCard).toContainText('可用', { timeout: 90_000 });

    const listResponse = await request.get(
      `${apiBaseUrl}/assets?keyword=${encodeURIComponent(assetName)}&page=1&pageSize=10`,
    );
    expect(listResponse.ok()).toBe(true);
    const assetList = (await listResponse.json()) as {
      items: { id: string }[];
    };
    assetId = assetList.items[0]?.id ?? '';
    expect(assetId).not.toBe('');

    const projectResponse = await request.post(`${apiBaseUrl}/projects`, {
      data: { name: `多模型编辑 ${unique}`, description: 'E2E' },
    });
    expect(projectResponse.ok()).toBe(true);
    const project = (await projectResponse.json()) as {
      id: string;
      scenes: { id: string }[];
    };
    projectId = project.id;
    const sceneId = project.scenes[0]?.id ?? '';
    expect(sceneId).not.toBe('');

    await page.goto(`/editor/${projectId}/${sceneId}`);
    const canvasHost = page.getByTestId('editor-canvas');
    await expect(canvasHost).toHaveAttribute('data-engine-ready', 'true');
    const assetCard = page.locator(`[data-asset-id="${assetId}"]`);
    await expect(assetCard).toBeVisible({ timeout: 30_000 });

    await assetCard.dblclick();
    await expect(canvasHost).toHaveAttribute('data-scene-object-count', '1');
    await assetCard.dblclick();
    await expect(canvasHost).toHaveAttribute('data-scene-object-count', '2');

    const treeRows = page.locator('.scene-tree-row[data-node-id]');
    await expect(treeRows).toHaveCount(2);
    const firstNodeId = await treeRows.nth(0).getAttribute('data-node-id');
    expect(firstNodeId).toBeTruthy();
    await treeRows.nth(0).locator('.scene-tree-label').click();
    const positionX = page.getByLabel('位置 X');
    await positionX.fill('4');
    await positionX.press('Tab');

    await page.locator('[data-asset-category="light"]').click();
    await page.getByTestId('add-light-point').click();
    await expect(canvasHost).toHaveAttribute('data-scene-object-count', '3');
    const intensity = page.getByLabel('强度');
    await intensity.fill('2.5');
    await intensity.press('Tab');

    await page.getByTestId('undo-scene').click();
    await expect(page.getByTestId('redo-scene')).toBeEnabled();
    await page.getByTestId('redo-scene').click();
    await expect(canvasHost).toHaveAttribute('data-scene-object-count', '3');

    const saveResponsePromise = page.waitForResponse(
      (response) =>
        response.url().endsWith(`/scenes/${sceneId}/document`) &&
        response.request().method() === 'PUT',
    );
    await page.getByTestId('save-scene').click();
    expect((await saveResponsePromise).ok()).toBe(true);
    await expect(page.getByTestId('status-bar')).toContainText('已保存');

    const sceneResponse = await request.get(`${apiBaseUrl}/scenes/${sceneId}`);
    expect(sceneResponse.ok()).toBe(true);
    const scene = (await sceneResponse.json()) as {
      document: {
        nodes: Record<
          string,
          {
            transform: { position: number[] };
            components: Array<
              | { kind: 'model'; assetId: string }
              | { kind: 'light'; lightType: string; intensity: number }
            >;
          }
        >;
      };
    };
    const nodes = Object.values(scene.document.nodes);
    const modelNodes = nodes.filter((node) =>
      node.components.some(
        (component) =>
          component.kind === 'model' && component.assetId === assetId,
      ),
    );
    const pointLight = nodes.find((node) =>
      node.components.some(
        (component) =>
          component.kind === 'light' && component.lightType === 'point',
      ),
    );
    expect(nodes).toHaveLength(3);
    expect(modelNodes).toHaveLength(2);
    expect(scene.document.nodes[firstNodeId ?? '']?.transform.position[0]).toBe(
      4,
    );
    expect(
      pointLight?.components.find((component) => component.kind === 'light'),
    ).toMatchObject({ intensity: 2.5 });

    await page.reload();
    await expect(canvasHost).toHaveAttribute('data-engine-ready', 'true');
    await expect(canvasHost).toHaveAttribute('data-scene-object-count', '3');
    await expect(page.locator('.scene-tree-row[data-node-id]')).toHaveCount(3);
  } finally {
    if (projectId) await request.delete(`${apiBaseUrl}/projects/${projectId}`);
    if (assetId) await request.delete(`${apiBaseUrl}/assets/${assetId}`);
  }
});
