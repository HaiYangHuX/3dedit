import { ConflictException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import type { MinioService } from '../src/infrastructure/minio.service.js';
import type { PrismaService } from '../src/infrastructure/prisma.service.js';
import { AssetService } from '../src/assets/asset.service.js';

const now = new Date('2026-07-16T06:00:00.000Z');
const assetRow = {
  id: 'asset-1',
  name: '水泵',
  kind: 'model',
  format: 'glb',
  status: 'ready',
  sourceHash: 'a'.repeat(64),
  category: '设备',
  tags: ['水泵'],
  favorite: false,
  error: null,
  retryCount: 0,
  activeFileId: 'file-1',
  metadata: { vertexCount: 42, faceCount: 12 },
  createdAt: now,
  updatedAt: now,
  activeFile: {
    id: 'file-1',
    assetId: 'asset-1',
    role: 'source',
    objectKey: 'assets/asset-1/source/pump.glb',
    mimeType: 'model/gltf-binary',
    size: 1024n,
    checksum: 'a'.repeat(64),
    createdAt: now,
  },
  files: [],
};

describe('AssetService', () => {
  it('使用筛选和分页返回资源列表', async () => {
    const prisma = {
      asset: {
        count: vi.fn().mockResolvedValue(1),
        findMany: vi.fn().mockResolvedValue([assetRow]),
      },
      scene: { findMany: vi.fn().mockResolvedValue([]) },
    } as unknown as PrismaService;
    const minio = {
      presignGet: vi.fn(),
    } as unknown as MinioService;
    const service = new AssetService(prisma, minio);

    const result = await service.list({
      page: 2,
      pageSize: 10,
      keyword: '泵',
      kind: 'model',
      category: '设备',
      status: 'ready',
      favorite: true,
    });

    expect(prisma.asset.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ skip: 10, take: 10 }),
    );
    expect(result).toMatchObject({ total: 1, page: 2, pageSize: 10 });
    expect(result.items[0]).toMatchObject({
      id: 'asset-1',
      sourceSize: 1024,
      referenceCount: 0,
    });
  });

  it('资源被场景引用时拒绝删除', async () => {
    const transaction = {
      asset: {
        findUnique: vi.fn().mockResolvedValue(assetRow),
        delete: vi.fn(),
      },
      scene: {
        findMany: vi.fn().mockResolvedValue([
          {
            document: {
              assetReferences: [{ assetId: 'asset-1', nodeIds: ['node-1'] }],
            },
          },
        ]),
      },
    };
    const prisma = {
      $transaction: vi.fn(
        async (callback: (client: typeof transaction) => Promise<unknown>) =>
          callback(transaction),
      ),
    } as unknown as PrismaService;
    const minio = { removePrefix: vi.fn() } as unknown as MinioService;
    const service = new AssetService(prisma, minio);

    await expect(service.remove('asset-1')).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(transaction.asset.delete).not.toHaveBeenCalled();
    expect(minio.removePrefix).not.toHaveBeenCalled();
  });

  it('删除未引用资源后清理 MinIO 前缀', async () => {
    const transaction = {
      asset: {
        findUnique: vi.fn().mockResolvedValue(assetRow),
        delete: vi.fn().mockResolvedValue(assetRow),
      },
      scene: { findMany: vi.fn().mockResolvedValue([]) },
    };
    const prisma = {
      $transaction: vi.fn(
        async (callback: (client: typeof transaction) => Promise<unknown>) =>
          callback(transaction),
      ),
    } as unknown as PrismaService;
    const minio = {
      removePrefix: vi.fn().mockResolvedValue(undefined),
    } as unknown as MinioService;
    const service = new AssetService(prisma, minio);

    await service.remove('asset-1');

    expect(transaction.asset.delete).toHaveBeenCalledWith({
      where: { id: 'asset-1' },
    });
    expect(minio.removePrefix).toHaveBeenCalledWith('assets/asset-1/');
  });
});
