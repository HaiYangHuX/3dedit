import {
  createDefaultSceneDocument,
  type SceneNode,
} from '@digital-twin/scene-schema';
import { ConflictException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import type { MinioService } from '../src/infrastructure/minio.service.js';
import type { PrismaService } from '../src/infrastructure/prisma.service.js';
import { PublicationService } from '../src/publications/publication.service.js';

const now = new Date('2026-07-16T12:00:00.000Z');

function modelNode(): SceneNode {
  return {
    id: 'device',
    parentId: null,
    childIds: [],
    name: '设备',
    enabled: true,
    locked: false,
    transform: {
      position: [0, 0, 0],
      rotation: [0, 0, 0],
      scale: [1, 1, 1],
    },
    components: [{ kind: 'model', assetId: 'asset-1' }],
    businessData: {},
  };
}

function sceneRow() {
  const document = createDefaultSceneDocument(
    'project-1',
    'scene-1',
    '发布场景',
  );
  const node = modelNode();
  document.nodes[node.id] = node;
  document.rootNodeIds = [node.id];
  return {
    id: 'scene-1',
    projectId: 'project-1',
    name: '发布场景',
    sortOrder: 0,
    revision: 1,
    document,
    contentHash: 'scene-hash',
    coverKey: null,
    createdAt: now,
    updatedAt: now,
  };
}

const readyAsset = {
  id: 'asset-1',
  name: '水泵',
  kind: 'model',
  format: 'glb',
  status: 'ready',
  activeFile: {
    objectKey: 'assets/asset-1/source/pump.glb',
    mimeType: 'model/gltf-binary',
    size: 1024n,
  },
};

describe('PublicationService', () => {
  it('全部对象写完后才原子切换当前 Publication 指针', async () => {
    const upsert = vi.fn(
      async ({ create }: { create: Record<string, unknown> }) => ({
        ...create,
        publishedAt: now,
        updatedAt: now,
      }),
    );
    const transaction = { publication: { upsert } };
    const prisma = {
      scene: { findUnique: vi.fn().mockResolvedValue(sceneRow()) },
      asset: { findMany: vi.fn().mockResolvedValue([readyAsset]) },
      publication: { findUnique: vi.fn().mockResolvedValue(null) },
      $transaction: vi.fn(
        async (callback: (client: typeof transaction) => Promise<unknown>) =>
          callback(transaction),
      ),
    } as unknown as PrismaService;
    const copyObject = vi.fn().mockResolvedValue(undefined);
    const putJson = vi.fn().mockResolvedValue(undefined);
    const minio = {
      copyObject,
      putJson,
      removePrefix: vi.fn().mockResolvedValue(undefined),
    } as unknown as MinioService;
    const service = new PublicationService(prisma, minio);

    const result = await service.publish('project-1', { sceneId: 'scene-1' });

    expect(copyObject).toHaveBeenCalledWith(
      'assets/asset-1/source/pump.glb',
      expect.stringMatching(
        /^publications\/.+\/releases\/.+\/assets\/asset-1\/source\.glb$/,
      ),
    );
    expect(putJson).toHaveBeenCalledTimes(2);
    expect(upsert).toHaveBeenCalledOnce();
    expect(putJson.mock.invocationCallOrder[1]).toBeLessThan(
      upsert.mock.invocationCallOrder[0]!,
    );
    expect(result).toMatchObject({
      projectId: 'project-1',
      sceneId: 'scene-1',
      status: 'active',
    });
  });

  it('资源未就绪时拒绝发布且不写 MinIO', async () => {
    const prisma = {
      scene: { findUnique: vi.fn().mockResolvedValue(sceneRow()) },
      asset: {
        findMany: vi
          .fn()
          .mockResolvedValue([
            { ...readyAsset, status: 'processing', activeFile: null },
          ]),
      },
      publication: { findUnique: vi.fn() },
    } as unknown as PrismaService;
    const minio = {
      copyObject: vi.fn(),
      putJson: vi.fn(),
    } as unknown as MinioService;
    const service = new PublicationService(prisma, minio);

    await expect(
      service.publish('project-1', { sceneId: 'scene-1' }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(minio.copyObject).not.toHaveBeenCalled();
    expect(minio.putJson).not.toHaveBeenCalled();
  });

  it('新包写入失败时清理临时前缀并保持旧指针不变', async () => {
    const oldPublication = {
      id: 'publication-1',
      projectId: 'project-1',
      sceneId: 'scene-old',
      releaseId: 'release-old',
      objectKey:
        'publications/publication-1/releases/release-old/manifest.json',
      sceneObjectKey:
        'publications/publication-1/releases/release-old/scene.json',
      contentHash: 'old-hash',
      status: 'active',
      publishedAt: now,
      updatedAt: now,
    };
    const prisma = {
      scene: { findUnique: vi.fn().mockResolvedValue(sceneRow()) },
      asset: { findMany: vi.fn().mockResolvedValue([readyAsset]) },
      publication: {
        findUnique: vi.fn().mockResolvedValue(oldPublication),
      },
      $transaction: vi.fn(),
    } as unknown as PrismaService;
    const minio = {
      copyObject: vi.fn().mockResolvedValue(undefined),
      putJson: vi.fn().mockRejectedValue(new Error('MinIO unavailable')),
      removePrefix: vi.fn().mockResolvedValue(undefined),
    } as unknown as MinioService;
    const service = new PublicationService(prisma, minio);

    await expect(
      service.publish('project-1', { sceneId: 'scene-1' }),
    ).rejects.toThrow('MinIO unavailable');
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(minio.removePrefix).toHaveBeenCalledWith(
      expect.stringMatching(
        /^publications\/publication-1\/releases\/(?!release-old).+\/$/,
      ),
    );
  });
});
