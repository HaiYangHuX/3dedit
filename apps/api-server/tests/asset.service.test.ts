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

  it('优先返回模型自身最新的封面附件', async () => {
    const olderCover = {
      id: 'cover-file-old',
      assetId: 'asset-1',
      role: 'cover',
      objectKey: 'assets/asset-1/cover/old.png',
      mimeType: 'image/png',
      size: 100n,
      checksum: 'b'.repeat(64),
      createdAt: new Date('2026-07-16T05:00:00.000Z'),
    };
    const latestCover = {
      ...olderCover,
      id: 'cover-file-new',
      objectKey: 'assets/asset-1/cover/new.png',
      checksum: 'c'.repeat(64),
      createdAt: new Date('2026-07-16T05:30:00.000Z'),
    };
    const thumbnail = {
      ...olderCover,
      id: 'thumbnail-file',
      role: 'thumbnail',
      objectKey: 'assets/asset-1/thumbnail/model.svg',
      mimeType: 'image/svg+xml',
    };
    const legacyCoverFile = {
      ...olderCover,
      id: 'legacy-cover-source',
      assetId: 'legacy-cover-asset',
      role: 'source',
      objectKey: 'assets/legacy-cover-asset/source/cover.png',
    };
    const row = {
      ...assetRow,
      coverAssetId: 'legacy-cover-asset',
      activeCoverFileId: olderCover.id,
      activeCoverFile: olderCover,
      files: [olderCover, thumbnail, latestCover],
      coverAsset: {
        id: 'legacy-cover-asset',
        kind: 'image',
        activeFile: legacyCoverFile,
        files: [legacyCoverFile],
      },
    };
    const prisma = {
      asset: {
        count: vi.fn().mockResolvedValue(1),
        findMany: vi.fn().mockResolvedValue([row]),
      },
      scene: { findMany: vi.fn().mockResolvedValue([]) },
    } as unknown as PrismaService;
    const minio = {
      presignGet: vi
        .fn()
        .mockImplementation((key: string) =>
          Promise.resolve(`https://minio.test/${encodeURIComponent(key)}`),
        ),
    } as unknown as MinioService;
    const service = new AssetService(prisma, minio);

    const result = await service.list({
      page: 1,
      pageSize: 24,
      keyword: '',
    });

    expect(result.items[0]?.coverUrl).toBe(
      `https://minio.test/${encodeURIComponent(olderCover.objectKey)}`,
    );
    expect(minio.presignGet).toHaveBeenCalledWith(olderCover.objectKey);
    expect(minio.presignGet).not.toHaveBeenCalledWith(
      legacyCoverFile.objectKey,
    );
  });

  it('没有附件封面时回退历史封面资源', async () => {
    const legacyCoverFile = {
      id: 'legacy-cover-source',
      assetId: 'legacy-cover-asset',
      role: 'source',
      objectKey: 'assets/legacy-cover-asset/source/cover.png',
      mimeType: 'image/png',
      size: 100n,
      checksum: 'b'.repeat(64),
      createdAt: now,
    };
    const row = {
      ...assetRow,
      coverAssetId: 'legacy-cover-asset',
      activeCoverFileId: null,
      activeCoverFile: null,
      coverAsset: {
        id: 'legacy-cover-asset',
        kind: 'image',
        activeFile: legacyCoverFile,
        files: [legacyCoverFile],
      },
    };
    const prisma = {
      asset: {
        count: vi.fn().mockResolvedValue(1),
        findMany: vi.fn().mockResolvedValue([row]),
      },
      scene: { findMany: vi.fn().mockResolvedValue([]) },
    } as unknown as PrismaService;
    const minio = {
      presignGet: vi
        .fn()
        .mockResolvedValue('https://assets.test/legacy-cover.png'),
    } as unknown as MinioService;

    const result = await new AssetService(prisma, minio).list({
      page: 1,
      pageSize: 24,
      keyword: '',
    });

    expect(result.items[0]?.coverUrl).toBe(
      'https://assets.test/legacy-cover.png',
    );
    expect(minio.presignGet).toHaveBeenCalledWith(legacyCoverFile.objectKey);
  });

  it('没有自定义封面时回退模型缩略图', async () => {
    const thumbnail = {
      id: 'thumbnail-file',
      assetId: 'asset-1',
      role: 'thumbnail',
      objectKey: 'assets/asset-1/thumbnail/model.svg',
      mimeType: 'image/svg+xml',
      size: 100n,
      checksum: 'b'.repeat(64),
      createdAt: now,
    };
    const row = {
      ...assetRow,
      coverAssetId: null,
      activeCoverFileId: null,
      activeCoverFile: null,
      files: [thumbnail],
      coverAsset: null,
    };
    const prisma = {
      asset: {
        count: vi.fn().mockResolvedValue(1),
        findMany: vi.fn().mockResolvedValue([row]),
      },
      scene: { findMany: vi.fn().mockResolvedValue([]) },
    } as unknown as PrismaService;
    const minio = {
      presignGet: vi
        .fn()
        .mockResolvedValue('https://assets.test/model-thumbnail.svg'),
    } as unknown as MinioService;

    const result = await new AssetService(prisma, minio).list({
      page: 1,
      pageSize: 24,
      keyword: '',
    });

    expect(result.items[0]?.coverUrl).toBe(
      'https://assets.test/model-thumbnail.svg',
    );
    expect(minio.presignGet).toHaveBeenCalledWith(thumbnail.objectKey);
  });

  it('清空自定义封面后不再回退历史封面附件', async () => {
    const oldCover = {
      id: 'old-cover-file',
      assetId: 'asset-1',
      role: 'cover',
      objectKey: 'assets/asset-1/cover/old.png',
      mimeType: 'image/png',
      size: 100n,
      checksum: 'b'.repeat(64),
      createdAt: now,
    };
    const thumbnail = {
      ...oldCover,
      id: 'thumbnail-file',
      role: 'thumbnail',
      objectKey: 'assets/asset-1/thumbnail/model.svg',
      mimeType: 'image/svg+xml',
    };
    const clearedRow = {
      ...assetRow,
      coverAssetId: null,
      activeCoverFileId: null,
      activeCoverFile: null,
      files: [oldCover, thumbnail],
      coverAsset: null,
    };
    const prisma = {
      asset: {
        findUnique: vi
          .fn()
          .mockResolvedValueOnce({ id: 'asset-1' })
          .mockResolvedValueOnce(clearedRow),
        update: vi.fn().mockResolvedValue(clearedRow),
      },
      scene: { findMany: vi.fn().mockResolvedValue([]) },
    } as unknown as PrismaService;
    const minio = {
      presignGet: vi
        .fn()
        .mockResolvedValue('https://assets.test/model-thumbnail.svg'),
    } as unknown as MinioService;

    const result = await new AssetService(prisma, minio).update('asset-1', {
      coverAssetId: null,
    });

    expect(prisma.asset.update).toHaveBeenCalledWith({
      where: { id: 'asset-1' },
      data: { coverAssetId: null, activeCoverFileId: null },
    });
    expect(result.customCoverUrl).toBeNull();
    expect(result.coverUrl).toBe('https://assets.test/model-thumbnail.svg');
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
