import { ConflictException, GoneException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { UploadService } from '../src/uploads/upload.service.js';
import type { MinioService } from '../src/infrastructure/minio.service.js';
import type { PrismaService } from '../src/infrastructure/prisma.service.js';
import type { QueueService } from '../src/infrastructure/queue.service.js';

const SHA256 = 'a'.repeat(64);
const now = new Date('2026-07-16T08:00:00.000Z');

describe('UploadService', () => {
  it('为 13 MiB 文件创建三个 5 MiB 分片并使用安全对象 Key', async () => {
    const prisma = {
      asset: {
        findUnique: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue({ id: 'asset-1' }),
      },
      uploadSession: {
        create: vi.fn().mockImplementation(({ data }) => ({
          ...data,
          id: 'upload-1',
        })),
      },
    } as unknown as PrismaService;
    const minio = {
      createMultipartUpload: vi.fn().mockResolvedValue('minio-upload-1'),
      presignUploadPart: vi
        .fn()
        .mockImplementation((_key, _uploadId, partNumber) =>
          Promise.resolve(`https://minio.test/part/${partNumber}`),
        ),
      abortMultipartUpload: vi.fn(),
    } as unknown as MinioService;
    const queue = {} as QueueService;
    const service = new UploadService(prisma, minio, queue, () => now);

    const result = await service.create({
      fileName: '../车间 水泵.glb',
      size: 13 * 1024 * 1024,
      sha256: SHA256,
      mimeType: 'model/gltf-binary',
      name: '水泵',
      category: '设备',
      tags: ['泵'],
      format: 'glb',
      kind: 'model',
    });

    expect(result).toMatchObject({
      id: 'upload-1',
      assetId: 'asset-1',
      partSize: 5 * 1024 * 1024,
      partCount: 3,
    });
    expect(result.partUrls).toHaveLength(3);
    expect(minio.createMultipartUpload).toHaveBeenCalledWith(
      'assets/asset-1/source/车间-水泵.glb',
      'model/gltf-binary',
    );
  });

  it('完成上传时排序 ETag、写入文件并只投递一次解析任务', async () => {
    const session = {
      id: 'upload-1',
      assetId: 'asset-1',
      objectKey: 'assets/asset-1/source/pump.glb',
      uploadId: 'minio-upload-1',
      fileName: 'pump.glb',
      mimeType: 'model/gltf-binary',
      size: 13n * 1024n * 1024n,
      sha256: SHA256,
      partSize: 5 * 1024 * 1024,
      partCount: 3,
      status: 'uploading',
      expiresAt: new Date('2026-07-17T08:00:00.000Z'),
    };
    const transaction = {
      uploadSession: {
        findUnique: vi.fn().mockResolvedValue(session),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      assetFile: {
        create: vi.fn().mockResolvedValue({ id: 'file-1' }),
      },
      asset: { update: vi.fn().mockResolvedValue({ id: 'asset-1' }) },
      processingJob: {
        create: vi.fn().mockResolvedValue({ id: 'job-1' }),
      },
    };
    const prisma = {
      $transaction: vi.fn(
        async (callback: (client: typeof transaction) => Promise<unknown>) =>
          callback(transaction),
      ),
    } as unknown as PrismaService;
    const minio = {
      completeMultipartUpload: vi.fn().mockResolvedValue(undefined),
    } as unknown as MinioService;
    const queue = {
      enqueueAssetAnalysis: vi.fn().mockResolvedValue(undefined),
    } as unknown as QueueService;
    const service = new UploadService(prisma, minio, queue, () => now);

    const result = await service.complete('upload-1', {
      parts: [
        { partNumber: 3, etag: 'etag-3' },
        { partNumber: 1, etag: 'etag-1' },
        { partNumber: 2, etag: 'etag-2' },
      ],
    });

    expect(minio.completeMultipartUpload).toHaveBeenCalledWith(
      session.objectKey,
      session.uploadId,
      [
        { partNumber: 1, etag: 'etag-1' },
        { partNumber: 2, etag: 'etag-2' },
        { partNumber: 3, etag: 'etag-3' },
      ],
    );
    expect(transaction.assetFile.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        assetId: 'asset-1',
        objectKey: session.objectKey,
        checksum: SHA256,
      }),
    });
    expect(queue.enqueueAssetAnalysis).toHaveBeenCalledTimes(1);
    expect(result).toEqual({
      assetId: 'asset-1',
      fileId: 'file-1',
      jobId: 'job-1',
      status: 'queued',
    });
  });

  it('拒绝完成已过期或分片数量不匹配的会话', async () => {
    const expired = {
      id: 'upload-1',
      status: 'uploading',
      expiresAt: new Date('2026-07-16T07:59:59.000Z'),
      partCount: 2,
    };
    const transaction = {
      uploadSession: { findUnique: vi.fn().mockResolvedValue(expired) },
    };
    const prisma = {
      $transaction: vi.fn(
        async (callback: (client: typeof transaction) => Promise<unknown>) =>
          callback(transaction),
      ),
    } as unknown as PrismaService;
    const service = new UploadService(
      prisma,
      {} as MinioService,
      {} as QueueService,
      () => now,
    );

    await expect(
      service.complete('upload-1', {
        parts: [{ partNumber: 1, etag: 'etag-1' }],
      }),
    ).rejects.toBeInstanceOf(GoneException);
  });

  it('拒绝为尚未失败的资源发起重试', async () => {
    const prisma = {
      asset: {
        findUnique: vi.fn().mockResolvedValue({
          id: 'asset-1',
          status: 'ready',
          activeFile: { id: 'file-1' },
        }),
      },
    } as unknown as PrismaService;
    const service = new UploadService(
      prisma,
      {} as MinioService,
      {} as QueueService,
      () => now,
    );

    await expect(service.retry('asset-1')).rejects.toBeInstanceOf(
      ConflictException,
    );
  });
});
