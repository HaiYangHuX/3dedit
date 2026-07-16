import { expect, test } from '@playwright/test';
import { createRequire } from 'node:module';
import { gzipSync } from 'node:zlib';
import { once } from 'node:events';
import { readFile, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { WebSocket, WebSocketServer } from 'ws';
import { createMinimalGlb } from './fixtures/minimalGlb';

const apiBaseUrl = process.env.E2E_API_BASE_URL ?? 'http://127.0.0.1:3100/api';
const databaseE2E = process.env.E2E_DATABASE === 'true';
const bucket = process.env.MINIO_BUCKET ?? 'assets';

interface PublicationResponse {
  id: string;
  contentHash: string;
  runtimeUrl: string;
}

interface ManifestResponse {
  publicationId: string;
  releaseId: string;
  contentHash: string;
}

interface PrismaClientLike {
  publication: {
    count(input: { where: { projectId: string } }): Promise<number>;
  };
  $disconnect(): Promise<void>;
}

interface ObjectStorageClient {
  listObjectsV2(
    bucketName: string,
    prefix: string,
    recursive: boolean,
  ): AsyncIterable<{ name?: string }>;
  removeObject(bucketName: string, objectKey: string): Promise<void>;
  removeObjects(bucketName: string, objectKeys: string[]): Promise<void>;
  putObject(
    bucketName: string,
    objectKey: string,
    body: Buffer,
    size: number,
    metadata: Record<string, string>,
  ): Promise<unknown>;
}

/**
 * E2E 需要检查数据库唯一指针和 MinIO 内部 release，但不把这些运维 SDK
 * 提升为根工作区依赖；从 API package 的真实依赖边界解析即可。
 */
function createInfrastructureClients(): {
  prisma: PrismaClientLike;
  objectStorage: ObjectStorageClient;
} {
  process.env.DATABASE_URL ??=
    'postgresql://digital_twin:digital_twin@127.0.0.1:5432/digital_twin';
  const requireFromApi = createRequire(resolve('apps/api-server/package.json'));
  const { PrismaClient } = requireFromApi('@prisma/client') as {
    PrismaClient: new () => PrismaClientLike;
  };
  const { Client } = requireFromApi('minio') as {
    Client: new (options: Record<string, unknown>) => ObjectStorageClient;
  };
  return {
    prisma: new PrismaClient(),
    objectStorage: new Client({
      endPoint: process.env.MINIO_ENDPOINT ?? '127.0.0.1',
      port: Number(process.env.MINIO_PORT ?? 9000),
      useSSL: process.env.MINIO_USE_SSL === 'true',
      accessKey: process.env.MINIO_ACCESS_KEY ?? 'digital-twin',
      secretKey: process.env.MINIO_SECRET_KEY ?? 'digital-twin-secret',
    }),
  };
}

async function listObjectNames(
  client: ObjectStorageClient,
  prefix: string,
): Promise<string[]> {
  const result: string[] = [];
  for await (const item of client.listObjectsV2(bucket, prefix, true)) {
    if (item.name) result.push(item.name);
  }
  return result.sort();
}

async function startSocketFixture(): Promise<{
  url: string;
  broadcast(payload: unknown): void;
  connectionCount(): number;
  close(): Promise<void>;
}> {
  const server = new WebSocketServer({ host: '127.0.0.1', port: 0 });
  await once(server, 'listening');
  const address = server.address();
  if (!address || typeof address === 'string') {
    throw new Error('WebSocket fixture 未取得随机端口');
  }
  let connections = 0;
  server.on('connection', () => {
    connections += 1;
  });
  return {
    url: `ws://127.0.0.1:${address.port}`,
    broadcast(payload) {
      const message = JSON.stringify(payload);
      for (const client of server.clients) {
        if (client.readyState === WebSocket.OPEN) client.send(message);
      }
    },
    connectionCount: () => connections,
    async close() {
      for (const client of server.clients) client.terminate();
      await new Promise<void>((resolveClose, rejectClose) => {
        server.close((error) => (error ? rejectClose(error) : resolveClose()));
      });
    },
  };
}

test('runtime 产物不携带编辑器依赖且保持首期体积预算', async ({
  browserName,
}, testInfo) => {
  const root = process.cwd();
  const runtimeAssets = resolve(root, 'apps/runtime-web/dist/assets');
  const editorAssets = resolve(root, 'apps/editor-web/dist/assets');
  const runtimeFiles = await readdir(runtimeAssets);
  const editorFiles = await readdir(editorAssets);
  const runtimeJs = await Promise.all(
    runtimeFiles
      .filter((file) => file.endsWith('.js'))
      .map((file) => readFile(resolve(runtimeAssets, file))),
  );
  const runtimeCss = await Promise.all(
    runtimeFiles
      .filter((file) => file.endsWith('.css'))
      .map((file) => readFile(resolve(runtimeAssets, file))),
  );
  const editorJs = await Promise.all(
    editorFiles
      .filter((file) => file.endsWith('.js'))
      .map((file) => readFile(resolve(editorAssets, file))),
  );
  const runtimeCode = Buffer.concat(runtimeJs).toString('utf8');
  const runtimeStyles = Buffer.concat(runtimeCss).toString('utf8');
  const runtimeBytes = runtimeJs.reduce((sum, file) => sum + file.length, 0);
  const editorBytes = editorJs.reduce((sum, file) => sum + file.length, 0);

  expect(runtimeCode).not.toContain('TransformControls');
  expect(runtimeCode).not.toContain('CommandHistory');
  expect(runtimeCode).not.toContain('应用数据源');
  expect(runtimeCode).not.toContain('项目配置');
  expect(runtimeStyles).not.toContain('.el-button');
  expect(runtimeBytes).toBeLessThanOrEqual(1.2 * 1024 * 1024);

  await testInfo.attach('bundle-sizes.json', {
    body: JSON.stringify(
      {
        browserName,
        runtimeBytes,
        runtimeGzipBytes: gzipSync(Buffer.concat(runtimeJs)).length,
        editorBytes,
        editorGzipBytes: gzipSync(Buffer.concat(editorJs)).length,
      },
      null,
      2,
    ),
    contentType: 'application/json',
  });
});

test('真实 Chromium 完成预览、WebSocket 与无版本原子发布闭环', async ({
  page,
  request,
  browser,
}, testInfo) => {
  test.skip(
    !databaseE2E,
    '真实运行时发布验收需要 PostgreSQL、Redis、MinIO 和 asset-worker',
  );
  test.setTimeout(240_000);

  const unique = String(Date.now());
  const glb = createMinimalGlb(`runtime-publication-${unique}`);
  const fileName = `runtime-pump-${unique}.glb`;
  const assetName = fileName.replace(/\.glb$/, '');
  const socket = await startSocketFixture();
  const { prisma, objectStorage } = createInfrastructureClients();
  let projectId = '';
  let assetId = '';
  let publicationId = '';

  try {
    await page.goto('/assets');
    await page.locator('input[type="file"]').setInputFiles({
      name: fileName,
      mimeType: 'model/gltf-binary',
      buffer: glb,
    });
    await expect(
      page.locator('.asset-card').filter({ hasText: assetName }),
    ).toContainText('可用', { timeout: 90_000 });

    const assetsResponse = await request.get(
      `${apiBaseUrl}/assets?keyword=${encodeURIComponent(assetName)}&page=1&pageSize=10`,
    );
    expect(assetsResponse.ok()).toBe(true);
    const assets = (await assetsResponse.json()) as {
      items: { id: string }[];
    };
    assetId = assets.items[0]?.id ?? '';
    expect(assetId).not.toBe('');

    const projectResponse = await request.post(`${apiBaseUrl}/projects`, {
      data: { name: `运行时发布 ${unique}`, description: '发布闭环 E2E' },
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
    const editorCanvas = page.getByTestId('editor-canvas');
    await expect(editorCanvas).toHaveAttribute('data-engine-ready', 'true');
    const assetCard = page.locator(`[data-asset-id="${assetId}"]`);
    await expect(assetCard).toBeVisible({ timeout: 30_000 });
    await assetCard.dblclick();
    // 添加命令含异步模型实例化，必须收敛后再发下一条，避免用同一旧文档并发建命。
    await expect(editorCanvas).toHaveAttribute('data-scene-object-count', '1');
    await assetCard.dblclick();
    await expect(editorCanvas).toHaveAttribute('data-scene-object-count', '2');

    await expect(page.getByTestId('status-bar')).toContainText('已保存');
    const sceneAfterAddsResponse = await request.get(
      `${apiBaseUrl}/scenes/${sceneId}`,
    );
    const sceneAfterAdds = (await sceneAfterAddsResponse.json()) as {
      document: {
        rootNodeIds: string[];
        nodes: Record<string, unknown>;
      };
    };
    await testInfo.attach('scene-after-model-adds.json', {
      body: JSON.stringify(sceneAfterAdds.document, null, 2),
      contentType: 'application/json',
    });
    expect(sceneAfterAdds.document.rootNodeIds).toHaveLength(2);
    expect(Object.keys(sceneAfterAdds.document.nodes)).toHaveLength(2);

    const treeRows = page.locator('.scene-tree-row[data-node-id]');
    await expect(treeRows).toHaveCount(2);
    const sourceNodeId = (await treeRows.nth(0).getAttribute('data-node-id'))!;
    const targetNodeId = (await treeRows.nth(1).getAttribute('data-node-id'))!;
    await treeRows.nth(0).locator('.scene-tree-label').click();
    await page.getByLabel('位置 X').fill('-0.3');
    await page.getByLabel('位置 X').press('Tab');
    await treeRows.nth(1).locator('.scene-tree-label').click();
    await page.getByLabel('位置 X').fill('3');
    await page.getByLabel('位置 X').press('Tab');

    const inspector = page.getByTestId('inspector-panel');
    await inspector
      .getByRole('button', { name: '交互事件', exact: true })
      .click();
    await inspector.getByTestId('add-interaction').click();
    await inspector.getByLabel('来源节点').selectOption(sourceNodeId);
    await inspector.getByTestId('interaction-actions-json').fill(
      JSON.stringify([
        {
          type: 'set-visibility',
          nodeId: targetNodeId,
          visible: false,
        },
      ]),
    );
    await inspector.getByTestId('apply-interaction').click();

    await inspector
      .getByRole('button', { name: 'Socket 任务', exact: true })
      .click();
    const socketPanel = inspector.locator('.socket-task-panel');
    await socketPanel.getByTestId('add-data-source').click();
    await socketPanel.getByLabel('URL').fill(socket.url);
    await socketPanel.getByRole('button', { name: '应用数据源' }).click();
    await socketPanel.getByTestId('add-socket-task').click();
    await socketPanel.getByLabel('taskCode').fill('device-position');
    // Socket 移动交互目标，不改变位于视口中心的点击源节点。
    await socketPanel.getByLabel('目标节点').selectOption(targetNodeId);
    await socketPanel.getByLabel('持续 ms').fill('0');
    await socketPanel
      .getByLabel('taskData JSON')
      .fill(JSON.stringify({ x: 1.25, y: 0, z: 0 }));
    await socketPanel.getByRole('button', { name: '应用任务' }).click();

    const saveResponse = page.waitForResponse(
      (response) =>
        response.url().endsWith(`/scenes/${sceneId}/document`) &&
        response.request().method() === 'PUT',
    );
    await page.getByTestId('save-scene').click();
    expect((await saveResponse).ok()).toBe(true);
    await expect(page.getByTestId('status-bar')).toContainText('已保存');

    const previewPromise = page.waitForEvent('popup');
    await page.getByTestId('preview-scene').click();
    const previewPage = await previewPromise;
    const previewCanvas = previewPage.getByTestId('runtime-canvas');
    await expect(previewCanvas).toHaveAttribute('data-runtime-ready', 'true');
    await expect(previewCanvas).toHaveAttribute('data-runtime-mode', 'preview');
    await expect(previewCanvas).toHaveAttribute('data-scene-object-count', '2');
    await expect(previewCanvas).toHaveAttribute('data-visible-mesh-count', '2');
    await expect(previewCanvas).toHaveAttribute('data-socket-status', 'open');
    await expect.poll(socket.connectionCount).toBeGreaterThanOrEqual(1);

    socket.broadcast({
      taskCode: 'device-position',
      taskTime: 0,
      taskData: { x: 1.25, y: 0, z: 0 },
    });
    await expect(previewCanvas).toHaveAttribute(
      'data-last-task-code',
      'device-position',
    );
    const previewWebgl = previewCanvas.locator('canvas');
    const previewBox = await previewWebgl.boundingBox();
    expect(previewBox).toBeTruthy();
    await previewWebgl.click({
      position: { x: previewBox!.width / 2, y: previewBox!.height / 2 },
    });
    await expect(previewCanvas).toHaveAttribute('data-visible-mesh-count', '1');

    const firstPublishResponse = page.waitForResponse(
      (response) =>
        response.url().endsWith(`/projects/${projectId}/publication`) &&
        response.request().method() === 'POST',
    );
    await page.getByTestId('publish-scene').click();
    const firstPublishHttp = await firstPublishResponse;
    expect(firstPublishHttp.ok()).toBe(true);
    const firstPublication =
      (await firstPublishHttp.json()) as PublicationResponse;
    publicationId = firstPublication.id;
    await expect(page.locator('.publication-result')).toContainText(
      firstPublication.runtimeUrl,
    );
    const firstManifestResponse = await request.get(
      `${apiBaseUrl}/publications/${publicationId}/manifest`,
    );
    expect(firstManifestResponse.ok()).toBe(true);
    const firstManifest =
      (await firstManifestResponse.json()) as ManifestResponse;

    const runtimeContext = await browser.newContext();
    const runtimePage = await runtimeContext.newPage();
    await runtimePage.goto(firstPublication.runtimeUrl);
    const runtimeCanvas = runtimePage.getByTestId('runtime-canvas');
    await expect(runtimeCanvas).toHaveAttribute('data-runtime-ready', 'true', {
      timeout: 30_000,
    });
    await expect(runtimeCanvas).toHaveAttribute('data-runtime-mode', 'runtime');
    await expect(runtimeCanvas).toHaveAttribute('data-scene-object-count', '2');
    await expect(runtimeCanvas).toHaveAttribute('data-visible-mesh-count', '2');
    await expect(runtimeCanvas).toHaveAttribute('data-socket-status', 'open');
    const runtimeWebgl = runtimeCanvas.locator('canvas');
    const runtimeBox = await runtimeWebgl.boundingBox();
    expect(runtimeBox).toBeTruthy();
    await runtimeWebgl.click({
      position: { x: runtimeBox!.width / 2, y: runtimeBox!.height / 2 },
    });
    await expect(runtimeCanvas).toHaveAttribute('data-visible-mesh-count', '1');
    socket.broadcast({
      taskCode: 'device-position',
      taskTime: 0,
      taskData: { x: 0, y: 0, z: 0 },
    });
    await expect(runtimeCanvas).toHaveAttribute(
      'data-last-task-code',
      'device-position',
    );

    await page.getByRole('button', { name: '关闭发布结果' }).click();
    // 修改场景后删除模型库源对象，发布复制必然失败；已发布包仍有独立副本可加载。
    await inspector
      .getByRole('button', { name: '场景内容', exact: true })
      .click();
    await treeRows.nth(0).locator('.scene-tree-label').click();
    await page.getByLabel('位置 Y').fill('0.5');
    await page.getByLabel('位置 Y').press('Tab');
    const secondSaveResponse = page.waitForResponse(
      (response) =>
        response.url().endsWith(`/scenes/${sceneId}/document`) &&
        response.request().method() === 'PUT',
    );
    await page.getByTestId('save-scene').click();
    expect((await secondSaveResponse).ok()).toBe(true);

    const assetDetailResponse = await request.get(
      `${apiBaseUrl}/assets/${assetId}`,
    );
    const assetDetail = (await assetDetailResponse.json()) as {
      files: { role: string; objectKey: string }[];
    };
    const sourceObjectKey = assetDetail.files.find(
      ({ role }) => role === 'source',
    )?.objectKey;
    expect(sourceObjectKey).toBeTruthy();
    await objectStorage.removeObject(bucket, sourceObjectKey!);

    const failedPublishResponse = page.waitForResponse(
      (response) =>
        response.url().endsWith(`/projects/${projectId}/publication`) &&
        response.request().method() === 'POST',
    );
    await page.getByTestId('publish-scene').click();
    expect((await failedPublishResponse).status()).toBeGreaterThanOrEqual(500);
    const currentAfterFailure = await request.get(
      `${apiBaseUrl}/projects/${projectId}/publication`,
    );
    expect(await currentAfterFailure.json()).toMatchObject({
      id: firstPublication.id,
      contentHash: firstPublication.contentHash,
    });
    await runtimePage.reload();
    // Chromium 重建 WebGL 上下文并重新解析 GLB，使用状态等待而不假设 5s 内完成。
    await expect(runtimeCanvas).toHaveAttribute('data-runtime-ready', 'true', {
      timeout: 30_000,
    });

    await objectStorage.putObject(bucket, sourceObjectKey!, glb, glb.length, {
      'content-type': 'model/gltf-binary',
    });
    const secondPublishResponse = page.waitForResponse(
      (response) =>
        response.url().endsWith(`/projects/${projectId}/publication`) &&
        response.request().method() === 'POST',
    );
    await page.getByTestId('publish-scene').click();
    const secondPublishHttp = await secondPublishResponse;
    expect(secondPublishHttp.ok()).toBe(true);
    const secondPublication =
      (await secondPublishHttp.json()) as PublicationResponse;
    expect(secondPublication.id).toBe(firstPublication.id);
    expect(secondPublication.contentHash).not.toBe(
      firstPublication.contentHash,
    );
    expect(await prisma.publication.count({ where: { projectId } })).toBe(1);

    const secondManifestResponse = await request.get(
      `${apiBaseUrl}/publications/${publicationId}/manifest`,
    );
    const secondManifest =
      (await secondManifestResponse.json()) as ManifestResponse;
    expect(secondManifest.releaseId).not.toBe(firstManifest.releaseId);
    await expect
      .poll(() =>
        listObjectNames(
          objectStorage,
          `publications/${publicationId}/releases/${firstManifest.releaseId}/`,
        ),
      )
      .toHaveLength(0);
    const publicationObjects = await listObjectNames(
      objectStorage,
      `publications/${publicationId}/releases/`,
    );
    expect(publicationObjects.length).toBeGreaterThanOrEqual(3);
    expect(
      publicationObjects.every((key) =>
        key.includes(`/releases/${secondManifest.releaseId}/`),
      ),
    ).toBe(true);
    await runtimeContext.close();
    await previewPage.close();
  } finally {
    if (projectId) {
      await request.delete(`${apiBaseUrl}/projects/${projectId}`);
    }
    if (assetId) await request.delete(`${apiBaseUrl}/assets/${assetId}`);
    if (publicationId) {
      const keys = await listObjectNames(
        objectStorage,
        `publications/${publicationId}/`,
      ).catch(() => []);
      if (keys.length > 0) await objectStorage.removeObjects(bucket, keys);
    }
    await prisma.$disconnect();
    await socket.close();
  }
});
