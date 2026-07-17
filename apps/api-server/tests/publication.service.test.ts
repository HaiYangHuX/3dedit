import {
  BUILTIN_ENVIRONMENT_ASSET_IDS,
  createDefaultMaterialComponent,
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

const readyTexture = {
  id: 'texture-1',
  name: '设备颜色',
  kind: 'image',
  format: 'png',
  status: 'ready',
  activeFile: {
    objectKey: 'assets/texture-1/source/color.png',
    mimeType: 'image/png',
    size: 256n,
  },
};

describe('PublicationService', () => {
  it('把材质贴图复制到独立 release 并写入 Manifest', async () => {
    const row = sceneRow();
    const material = createDefaultMaterialComponent();
    material.textures.baseColor = {
      assetId: 'texture-1',
      offset: [0, 0],
      repeat: [1, 1],
      rotation: 0,
      wrapS: 'repeat',
      wrapT: 'repeat',
    };
    row.document.nodes.device!.components.push(material);
    const transaction = {
      publication: {
        upsert: vi.fn(async ({ create }) => ({
          ...create,
          publishedAt: now,
          updatedAt: now,
        })),
      },
    };
    const findMany = vi.fn().mockResolvedValue([readyAsset, readyTexture]);
    const prisma = {
      scene: { findUnique: vi.fn().mockResolvedValue(row) },
      asset: { findMany },
      publication: { findUnique: vi.fn().mockResolvedValue(null) },
      $transaction: vi.fn(async (callback) => callback(transaction)),
    } as unknown as PrismaService;
    const copyObject = vi.fn().mockResolvedValue(undefined);
    const minio = {
      copyObject,
      putJson: vi.fn().mockResolvedValue(undefined),
      removePrefix: vi.fn().mockResolvedValue(undefined),
    } as unknown as MinioService;

    await new PublicationService(prisma, minio).publish('project-1', {
      sceneId: 'scene-1',
    });

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: { in: ['asset-1', 'texture-1'] } },
      }),
    );
    expect(copyObject).toHaveBeenCalledWith(
      'assets/texture-1/source/color.png',
      expect.stringMatching(/assets\/texture-1\/source\.png$/),
    );
  });

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

  it('发布内置环境时不要求数据库素材或复制对象存储文件', async () => {
    const row = sceneRow();
    row.document.nodes = {};
    row.document.rootNodeIds = [];
    row.document.settings.environmentAssetId = BUILTIN_ENVIRONMENT_ASSET_IDS[0];
    const findMany = vi.fn().mockResolvedValue([]);
    const transaction = {
      publication: {
        upsert: vi.fn(async ({ create }) => ({
          ...create,
          publishedAt: now,
          updatedAt: now,
        })),
      },
    };
    const prisma = {
      scene: { findUnique: vi.fn().mockResolvedValue(row) },
      asset: { findMany },
      publication: { findUnique: vi.fn().mockResolvedValue(null) },
      $transaction: vi.fn(async (callback) => callback(transaction)),
    } as unknown as PrismaService;
    const minio = {
      copyObject: vi.fn(),
      putJson: vi.fn().mockResolvedValue(undefined),
      removePrefix: vi.fn().mockResolvedValue(undefined),
    } as unknown as MinioService;

    await new PublicationService(prisma, minio).publish('project-1', {
      sceneId: 'scene-1',
    });

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: { in: [] } } }),
    );
    expect(minio.copyObject).not.toHaveBeenCalled();
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
