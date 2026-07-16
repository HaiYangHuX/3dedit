import { expect, test } from '@playwright/test';

const apiBaseUrl = process.env.E2E_API_BASE_URL ?? 'http://127.0.0.1:3100/api';

test.skip(
  process.env.E2E_DATABASE !== 'true',
  '真实资源验收需要 PostgreSQL、Redis、MinIO 和 asset-worker',
);

/** 为每次 E2E 写入唯一 generator，避免上次异常中断留下相同 sourceHash。 */
function createMinimalGlb(unique: string): Buffer {
  const document = {
    asset: { version: '2.0', generator: unique },
    buffers: [{ byteLength: 42 }],
    bufferViews: [
      { buffer: 0, byteOffset: 0, byteLength: 36 },
      { buffer: 0, byteOffset: 36, byteLength: 6 },
    ],
    accessors: [
      {
        bufferView: 0,
        componentType: 5126,
        count: 3,
        type: 'VEC3',
        min: [-1, 0, -1],
        max: [1, 2, 1],
      },
      { bufferView: 1, componentType: 5123, count: 3, type: 'SCALAR' },
    ],
    meshes: [{ primitives: [{ attributes: { POSITION: 0 }, indices: 1 }] }],
  };
  const json = Buffer.from(JSON.stringify(document));
  const jsonChunk = Buffer.concat([
    json,
    Buffer.alloc((4 - (json.length % 4)) % 4, 0x20),
  ]);
  const binary = Buffer.alloc(44);
  const total = 12 + 8 + jsonChunk.length + 8 + binary.length;
  const glb = Buffer.alloc(total);
  glb.writeUInt32LE(0x46546c67, 0);
  glb.writeUInt32LE(2, 4);
  glb.writeUInt32LE(total, 8);
  glb.writeUInt32LE(jsonChunk.length, 12);
  glb.writeUInt32LE(0x4e4f534a, 16);
  jsonChunk.copy(glb, 20);
  const binaryOffset = 20 + jsonChunk.length;
  glb.writeUInt32LE(binary.length, binaryOffset);
  glb.writeUInt32LE(0x004e4942, binaryOffset + 4);
  binary.copy(glb, binaryOffset + 8);
  return glb;
}

test('浏览器分片上传、Worker 解析和引用删除保护闭环', async ({
  page,
  request,
}) => {
  test.setTimeout(120_000);
  const unique = `${Date.now()}`;
  const fileName = `e2e-pump-${unique}.glb`;
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

    const assetCard = page
      .locator('.asset-card')
      .filter({ hasText: assetName });
    await expect(assetCard).toContainText('可用', { timeout: 90_000 });
    await expect(assetCard).toContainText('3 顶点');
    await expect(assetCard).toContainText('1 面');
    await expect(assetCard.locator('.asset-preview img')).toBeVisible();

    const listResponse = await request.get(
      `${apiBaseUrl}/assets?keyword=${encodeURIComponent(assetName)}&page=1&pageSize=10`,
    );
    expect(listResponse.ok()).toBe(true);
    const list = (await listResponse.json()) as {
      items: { id: string; status: string; thumbnailUrl: string | null }[];
    };
    expect(list.items[0]).toMatchObject({ status: 'ready' });
    expect(list.items[0]?.thumbnailUrl).toBeTruthy();
    assetId = list.items[0]?.id ?? '';

    const projectResponse = await request.post(`${apiBaseUrl}/projects`, {
      data: { name: `资源保护 ${unique}`, description: 'E2E' },
    });
    expect(projectResponse.ok()).toBe(true);
    const project = (await projectResponse.json()) as {
      id: string;
      scenes: { id: string }[];
    };
    projectId = project.id;
    const sceneId = project.scenes[0]?.id ?? '';
    const sceneResponse = await request.get(`${apiBaseUrl}/scenes/${sceneId}`);
    const scene = (await sceneResponse.json()) as {
      revision: number;
      document: Record<string, unknown> & {
        revision: number;
        rootNodeIds: string[];
        nodes: Record<string, unknown>;
        assetReferences: unknown[];
      };
    };
    const nodeId = `node-${unique}`;
    scene.document.rootNodeIds = [nodeId];
    scene.document.nodes = {
      [nodeId]: {
        id: nodeId,
        parentId: null,
        childIds: [],
        name: assetName,
        enabled: true,
        locked: false,
        transform: {
          position: [0, 0, 0],
          rotation: [0, 0, 0],
          scale: [1, 1, 1],
        },
        components: [{ kind: 'model', assetId }],
        businessData: {},
      },
    };
    scene.document.assetReferences = [{ assetId, nodeIds: [nodeId] }];
    const savedResponse = await request.put(
      `${apiBaseUrl}/scenes/${sceneId}/document`,
      { data: { baseRevision: scene.revision, document: scene.document } },
    );
    expect(savedResponse.ok()).toBe(true);
    const saved = (await savedResponse.json()) as { revision: number };

    const protectedDelete = await request.delete(
      `${apiBaseUrl}/assets/${assetId}`,
    );
    expect(protectedDelete.status()).toBe(409);
    expect(await protectedDelete.json()).toMatchObject({
      code: 'ASSET_IN_USE',
    });

    scene.document.rootNodeIds = [];
    scene.document.nodes = {};
    scene.document.assetReferences = [];
    scene.document.revision = saved.revision;
    expect(
      (
        await request.put(`${apiBaseUrl}/scenes/${sceneId}/document`, {
          data: { baseRevision: saved.revision, document: scene.document },
        })
      ).ok(),
    ).toBe(true);
    expect(
      (await request.delete(`${apiBaseUrl}/assets/${assetId}`)).status(),
    ).toBe(204);
    assetId = '';
  } finally {
    if (projectId) await request.delete(`${apiBaseUrl}/projects/${projectId}`);
    if (assetId) await request.delete(`${apiBaseUrl}/assets/${assetId}`);
  }
});
