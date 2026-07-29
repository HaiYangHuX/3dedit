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
      purpose: 'source',
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
      uploadSession: {
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
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

  it('替换上传只更新普通 Asset.version，不访问版本历史表', async () => {
    const existing = {
      id: 'asset-1',
      version: '2.3.4',
      activeFile: {
        objectKey: 'assets/asset-1/source/old.glb',
      },
    };
    const session = {
      id: 'upload-replace-1',
      assetId: 'asset-1',
      objectKey: 'assets/asset-1/source/new.glb',
      uploadId: 'minio-upload-replace-1',
      fileName: 'new.glb',
      mimeType: 'model/gltf-binary',
      size: 1_024n,
      sha256: SHA256,
      partSize: 5 * 1024 * 1024,
      partCount: 1,
      status: 'uploading',
      expiresAt: new Date('2026-07-17T08:00:00.000Z'),
      metadata: {
        name: '水泵新模型',
        version: '2.3.4',
      },
    };
    const transaction = {
      uploadSession: {
        findUnique: vi.fn().mockResolvedValue(session),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      assetFile: {
        create: vi.fn().mockResolvedValue({ id: 'file-replace-1' }),
      },
      asset: { update: vi.fn().mockResolvedValue(existing) },
      processingJob: {
        create: vi.fn().mockResolvedValue({ id: 'job-replace-1' }),
      },
    };
    const prisma = {
      asset: {
        findUnique: vi.fn().mockResolvedValue(existing),
        update: vi.fn().mockResolvedValue(existing),
      },
      uploadSession: {
        create: vi.fn().mockResolvedValue(session),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      $transaction: vi.fn(
        async (callback: (client: typeof transaction) => Promise<unknown>) =>
          callback(transaction),
      ),
    } as unknown as PrismaService;
    const minio = {
      createMultipartUpload: vi
        .fn()
        .mockResolvedValue('minio-upload-replace-1'),
      presignUploadPart: vi
        .fn()
        .mockResolvedValue('https://minio.test/replace-part/1'),
      completeMultipartUpload: vi.fn().mockResolvedValue(undefined),
    } as unknown as MinioService;
    const queue = {
      enqueueAssetAnalysis: vi.fn().mockResolvedValue(undefined),
    } as unknown as QueueService;
    const service = new UploadService(prisma, minio, queue, () => now);

    await service.create({
      fileName: 'new.glb',
      size: 1_024,
      sha256: SHA256,
      mimeType: 'model/gltf-binary',
      name: '水泵新模型',
      assetId: 'asset-1',
      category: '设备',
      tags: [],
      format: 'glb',
      kind: 'model',
      purpose: 'source',
    });
    expect(prisma.uploadSession.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        metadata: expect.objectContaining({ version: '2.3.4' }),
      }),
    });
    await service.complete('upload-replace-1', {
      parts: [{ partNumber: 1, etag: 'etag-replace-1' }],
    });

    expect(prisma.asset.update).toHaveBeenCalledWith({
      where: { id: 'asset-1' },
      data: { status: 'uploading', error: null },
    });
    expect(transaction.asset.update).toHaveBeenCalledWith({
      where: { id: 'asset-1' },
      data: expect.objectContaining({ version: '2.3.4' }),
    });
  });

  it('为已有模型创建封面会话且不改变模型状态', async () => {
    const existing = {
      id: 'asset-1',
      version: '1.0.0',
      activeFile: { objectKey: 'assets/asset-1/source/pump.glb' },
    };
    const prisma = {
      asset: {
        findUnique: vi.fn().mockResolvedValue(existing),
        create: vi.fn(),
        update: vi.fn(),
      },
      uploadSession: {
        create: vi.fn().mockImplementation(({ data }) => ({
          ...data,
          id: 'cover-upload-1',
        })),
      },
    } as unknown as PrismaService;
    const minio = {
      createMultipartUpload: vi.fn().mockResolvedValue('minio-cover-upload-1'),
      presignUploadPart: vi
        .fn()
        .mockResolvedValue('https://minio.test/cover-part/1'),
      abortMultipartUpload: vi.fn(),
    } as unknown as MinioService;
    const service = new UploadService(
      prisma,
      minio,
      {} as QueueService,
      () => now,
    );

    const input = {
      fileName: 'pump-cover.png',
      size: 1_024,
      sha256: SHA256,
      mimeType: 'image/png',
      name: '水泵封面',
      assetId: 'asset-1',
      purpose: 'cover',
      category: '封面',
      tags: [] as string[],
      format: 'png',
      kind: 'image',
    } as const;
    const result = await service.create(input);
    await service.create(input);

    expect(result.assetId).toBe('asset-1');
    expect(minio.createMultipartUpload).toHaveBeenCalledWith(
      expect.stringMatching(
        /^assets\/asset-1\/cover\/[0-9a-f-]+-pump-cover\.png$/,
      ),
      'image/png',
    );
    const coverObjectKeys = vi
      .mocked(minio.createMultipartUpload)
      .mock.calls.map(([objectKey]) => objectKey);
    expect(coverObjectKeys).toHaveLength(2);
    expect(coverObjectKeys[0]).not.toBe(coverObjectKeys[1]);
    expect(prisma.uploadSession.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        assetId: 'asset-1',
        purpose: 'cover',
        objectKey: expect.stringContaining('assets/asset-1/cover/'),
      }),
    });
    expect(prisma.asset.create).not.toHaveBeenCalled();
    expect(prisma.asset.update).not.toHaveBeenCalled();
  });

  it('为项目封面创建不绑定资源的独立上传会话', async () => {
    const prisma = {
      asset: {
        findUnique: vi.fn(),
        create: vi.fn(),
      },
      uploadSession: {
        create: vi.fn().mockImplementation(({ data }) => ({
          ...data,
          id: 'project-cover-upload-1',
        })),
      },
    } as unknown as PrismaService;
    const minio = {
      createMultipartUpload: vi.fn().mockResolvedValue('minio-upload-1'),
      presignUploadPart: vi.fn().mockResolvedValue('https://minio.test/part/1'),
      abortMultipartUpload: vi.fn(),
    } as unknown as MinioService;
    const service = new UploadService(
      prisma,
      minio,
      {} as QueueService,
      () => now,
    );

    const result = await service.create({
      fileName: 'factory-cover.png',
      size: 1_024,
      sha256: SHA256,
      mimeType: 'image/png',
      name: 'factory-cover',
      purpose: 'project-cover',
      category: '未分类',
      tags: [],
      format: 'png',
      kind: 'image',
    });

    expect(result.assetId).toBeNull();
    expect(prisma.asset.findUnique).not.toHaveBeenCalled();
    expect(prisma.asset.create).not.toHaveBeenCalled();
    expect(minio.createMultipartUpload).toHaveBeenCalledWith(
      expect.stringMatching(
        /^covers\/projects\/[0-9a-f-]+-factory-cover\.png$/,
      ),
      'image/png',
    );
    expect(prisma.uploadSession.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        assetId: null,
        purpose: 'project-cover',
      }),
    });
  });

  it('完成独立封面上传后只返回对象键且不创建资源记录', async () => {
    const session = {
      id: 'project-cover-upload-1',
      assetId: null,
      objectKey: 'covers/projects/project-cover.png',
      uploadId: 'minio-upload-1',
      fileName: 'project-cover.png',
      mimeType: 'image/png',
      size: 1_024n,
      sha256: SHA256,
      format: 'png',
      purpose: 'project-cover',
      metadata: {},
      partSize: 5 * 1024 * 1024,
      partCount: 1,
      status: 'uploading',
      expiresAt: new Date('2026-07-17T08:00:00.000Z'),
      updatedAt: now,
    };
    const transaction = {
      uploadSession: {
        findUnique: vi.fn().mockResolvedValue(session),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      assetFile: { create: vi.fn() },
      asset: { update: vi.fn() },
      processingJob: { create: vi.fn() },
    };
    const prisma = {
      uploadSession: {
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      $transaction: vi.fn(
        async (callback: (client: typeof transaction) => Promise<unknown>) =>
          callback(transaction),
      ),
    } as unknown as PrismaService;
    const minio = {
      completeMultipartUpload: vi.fn().mockResolvedValue(undefined),
      presignGet: vi.fn().mockResolvedValue('https://assets.test/project.png'),
    } as unknown as MinioService;
    const service = new UploadService(
      prisma,
      minio,
      {} as QueueService,
      () => now,
    );

    await expect(
      service.complete(session.id, {
        parts: [{ partNumber: 1, etag: 'etag-1' }],
      }),
    ).resolves.toEqual({
      objectKey: session.objectKey,
      url: 'https://assets.test/project.png',
      status: 'stored',
    });
    expect(transaction.assetFile.create).not.toHaveBeenCalled();
    expect(transaction.asset.update).not.toHaveBeenCalled();
    expect(transaction.processingJob.create).not.toHaveBeenCalled();
  });

  it('封面预签名失败时删除客户端不可见的上传会话', async () => {
    const existing = {
      id: 'asset-1',
      version: '1.0.0',
      activeFile: { objectKey: 'assets/asset-1/source/pump.glb' },
    };
    const prisma = {
      asset: {
        findUnique: vi.fn().mockResolvedValue(existing),
        delete: vi.fn(),
      },
      uploadSession: {
        create: vi.fn().mockResolvedValue({ id: 'cover-upload-1' }),
        deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
    } as unknown as PrismaService;
    const minio = {
      createMultipartUpload: vi.fn().mockResolvedValue('minio-cover-upload-1'),
      presignUploadPart: vi
        .fn()
        .mockRejectedValue(new Error('presign unavailable')),
      abortMultipartUpload: vi.fn().mockResolvedValue(undefined),
    } as unknown as MinioService;
    const service = new UploadService(
      prisma,
      minio,
      {} as QueueService,
      () => now,
    );

    await expect(
      service.create({
        fileName: 'pump-cover.png',
        size: 1_024,
        sha256: SHA256,
        mimeType: 'image/png',
        name: '水泵封面',
        assetId: 'asset-1',
        purpose: 'cover',
        category: '封面',
        tags: [],
        format: 'png',
        kind: 'image',
      }),
    ).rejects.toThrow('presign unavailable');
    expect(prisma.uploadSession.deleteMany).toHaveBeenCalledWith({
      where: { id: 'cover-upload-1', status: 'uploading' },
    });
    expect(prisma.asset.delete).not.toHaveBeenCalled();
  });

  it('完成封面上传时替换模型附件且不创建解析任务', async () => {
    const session = {
      id: 'cover-upload-1',
      assetId: 'asset-1',
      objectKey: 'assets/asset-1/cover/new-cover.png',
      uploadId: 'minio-cover-upload-1',
      fileName: 'new-cover.png',
      mimeType: 'image/png',
      size: 1_024n,
      sha256: SHA256,
      format: 'png',
      purpose: 'cover',
      metadata: {},
      partSize: 5 * 1024 * 1024,
      partCount: 1,
      status: 'uploading',
      expiresAt: new Date('2026-07-17T08:00:00.000Z'),
    };
    const oldCover = {
      id: 'old-cover-file',
      objectKey: 'assets/asset-1/cover/old-cover.png',
    };
    const transaction = {
      uploadSession: {
        findUnique: vi.fn().mockResolvedValue(session),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      assetFile: {
        findFirst: vi.fn().mockResolvedValue(oldCover),
        create: vi.fn().mockResolvedValue({ id: 'new-cover-file' }),
        delete: vi.fn().mockResolvedValue(oldCover),
      },
      asset: { update: vi.fn().mockResolvedValue({ id: 'asset-1' }) },
      processingJob: { create: vi.fn() },
    };
    const prisma = {
      uploadSession: {
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      $transaction: vi.fn(
        async (callback: (client: typeof transaction) => Promise<unknown>) =>
          callback(transaction),
      ),
    } as unknown as PrismaService;
    const minio = {
      completeMultipartUpload: vi.fn().mockResolvedValue(undefined),
      removePrefix: vi.fn().mockResolvedValue(undefined),
    } as unknown as MinioService;
    const queue = {
      enqueueAssetAnalysis: vi.fn(),
    } as unknown as QueueService;
    const service = new UploadService(prisma, minio, queue, () => now);

    const result = await service.complete('cover-upload-1', {
      parts: [{ partNumber: 1, etag: 'etag-cover-1' }],
    });

    expect(transaction.assetFile.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        assetId: 'asset-1',
        role: 'cover',
        objectKey: session.objectKey,
      }),
    });
    expect(transaction.assetFile.delete).not.toHaveBeenCalled();
    expect(transaction.asset.update).toHaveBeenCalledWith({
      where: { id: 'asset-1' },
      data: {
        activeCoverFileId: 'new-cover-file',
        coverAssetId: null,
      },
    });
    expect(transaction.processingJob.create).not.toHaveBeenCalled();
    expect(queue.enqueueAssetAnalysis).not.toHaveBeenCalled();
    expect(minio.removePrefix).not.toHaveBeenCalled();
    expect(result).toEqual({
      assetId: 'asset-1',
      fileId: 'new-cover-file',
      status: 'ready',
    });
  });

  it('重复完成封面会话时恢复 ready 回执且不补建解析任务', async () => {
    const session = {
      id: 'cover-upload-1',
      assetId: 'asset-1',
      objectKey: 'assets/asset-1/cover/new-cover.png',
      purpose: 'cover',
      status: 'completed',
    };
    const transaction = {
      uploadSession: { findUnique: vi.fn().mockResolvedValue(session) },
    };
    const prisma = {
      $transaction: vi.fn(
        async (callback: (client: typeof transaction) => Promise<unknown>) =>
          callback(transaction),
      ),
      assetFile: {
        findUnique: vi.fn().mockResolvedValue({ id: 'new-cover-file' }),
      },
      processingJob: { findFirst: vi.fn().mockResolvedValue(null) },
    } as unknown as PrismaService;
    const queue = {
      enqueueAssetAnalysis: vi.fn(),
    } as unknown as QueueService;
    const service = new UploadService(
      prisma,
      {} as MinioService,
      queue,
      () => now,
    );

    await expect(
      service.complete('cover-upload-1', {
        parts: [{ partNumber: 1, etag: 'etag-cover-1' }],
      }),
    ).resolves.toEqual({
      assetId: 'asset-1',
      fileId: 'new-cover-file',
      status: 'ready',
    });
    expect(prisma.processingJob.findFirst).not.toHaveBeenCalled();
    expect(queue.enqueueAssetAnalysis).not.toHaveBeenCalled();
  });

  it('MinIO 完成后先持久化 uploaded 以便数据库失败后重试', async () => {
    const session = {
      id: 'cover-upload-1',
      assetId: 'asset-1',
      objectKey: 'assets/asset-1/cover/new-cover.png',
      uploadId: 'minio-cover-upload-1',
      fileName: 'new-cover.png',
      mimeType: 'image/png',
      size: 1_024n,
      sha256: SHA256,
      format: 'png',
      purpose: 'cover',
      metadata: {},
      partSize: 5 * 1024 * 1024,
      partCount: 1,
      status: 'uploading',
      expiresAt: new Date('2026-07-17T08:00:00.000Z'),
    };
    const claimTransaction = {
      uploadSession: {
        findUnique: vi.fn().mockResolvedValue(session),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
    };
    const prisma = {
      uploadSession: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
      $transaction: vi
        .fn()
        .mockImplementationOnce(
          async (
            callback: (client: typeof claimTransaction) => Promise<unknown>,
          ) => callback(claimTransaction),
        )
        .mockRejectedValueOnce(new Error('database unavailable')),
    } as unknown as PrismaService;
    const minio = {
      completeMultipartUpload: vi.fn().mockResolvedValue(undefined),
    } as unknown as MinioService;
    const service = new UploadService(
      prisma,
      minio,
      {} as QueueService,
      () => now,
    );

    await expect(
      service.complete('cover-upload-1', {
        parts: [{ partNumber: 1, etag: 'etag-cover-1' }],
      }),
    ).rejects.toThrow('database unavailable');

    expect(prisma.uploadSession.updateMany).toHaveBeenCalledWith({
      where: {
        id: 'cover-upload-1',
        status: 'completing',
        updatedAt: now,
      },
      data: { status: 'uploaded' },
    });
  });

  it('MinIO 完成响应超时但对象已存在时继续数据库收尾', async () => {
    const session = {
      id: 'cover-upload-1',
      assetId: 'asset-1',
      objectKey: 'assets/asset-1/cover/new-cover.png',
      uploadId: 'minio-cover-upload-1',
      fileName: 'new-cover.png',
      mimeType: 'image/png',
      size: 1_024n,
      sha256: SHA256,
      format: 'png',
      purpose: 'cover',
      metadata: {},
      partSize: 5 * 1024 * 1024,
      partCount: 1,
      status: 'uploading',
      expiresAt: new Date('2026-07-17T08:00:00.000Z'),
    };
    const transaction = {
      uploadSession: {
        findUnique: vi.fn().mockResolvedValue(session),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      assetFile: {
        create: vi.fn().mockResolvedValue({ id: 'new-cover-file' }),
      },
      asset: { update: vi.fn().mockResolvedValue({ id: 'asset-1' }) },
    };
    const prisma = {
      uploadSession: {
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      $transaction: vi.fn(
        async (callback: (client: typeof transaction) => Promise<unknown>) =>
          callback(transaction),
      ),
    } as unknown as PrismaService;
    const minio = {
      completeMultipartUpload: vi
        .fn()
        .mockRejectedValue(new Error('response timeout')),
      objectExists: vi.fn().mockResolvedValue(true),
    } as unknown as MinioService;
    const service = new UploadService(
      prisma,
      minio,
      {} as QueueService,
      () => now,
    );

    await expect(
      service.complete('cover-upload-1', {
        parts: [{ partNumber: 1, etag: 'etag-cover-1' }],
      }),
    ).resolves.toEqual({
      assetId: 'asset-1',
      fileId: 'new-cover-file',
      status: 'ready',
    });
    expect(minio.objectExists).toHaveBeenCalledWith(session.objectKey);
    expect(prisma.uploadSession.updateMany).toHaveBeenCalledWith({
      where: {
        id: 'cover-upload-1',
        status: 'completing',
        updatedAt: now,
      },
      data: { status: 'uploaded' },
    });
  });

  it('重试 uploaded 封面会话时跳过 MinIO 并完成数据库记录', async () => {
    const session = {
      id: 'cover-upload-1',
      assetId: 'asset-1',
      objectKey: 'assets/asset-1/cover/new-cover.png',
      uploadId: 'minio-cover-upload-1',
      fileName: 'new-cover.png',
      mimeType: 'image/png',
      size: 1_024n,
      sha256: SHA256,
      format: 'png',
      purpose: 'cover',
      metadata: {},
      partSize: 5 * 1024 * 1024,
      partCount: 1,
      status: 'uploaded',
      expiresAt: new Date('2026-07-17T08:00:00.000Z'),
    };
    const transaction = {
      uploadSession: {
        findUnique: vi.fn().mockResolvedValue(session),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      assetFile: {
        create: vi.fn().mockResolvedValue({ id: 'new-cover-file' }),
      },
      asset: { update: vi.fn().mockResolvedValue({ id: 'asset-1' }) },
      processingJob: { create: vi.fn() },
    };
    const prisma = {
      $transaction: vi.fn(
        async (callback: (client: typeof transaction) => Promise<unknown>) =>
          callback(transaction),
      ),
    } as unknown as PrismaService;
    const minio = {
      completeMultipartUpload: vi.fn(),
    } as unknown as MinioService;
    const service = new UploadService(
      prisma,
      minio,
      {} as QueueService,
      () => now,
    );

    await expect(
      service.complete('cover-upload-1', {
        parts: [{ partNumber: 1, etag: 'etag-cover-1' }],
      }),
    ).resolves.toEqual({
      assetId: 'asset-1',
      fileId: 'new-cover-file',
      status: 'ready',
    });
    expect(minio.completeMultipartUpload).not.toHaveBeenCalled();
  });

  it('uploaded 会话的并发收尾输家恢复已完成回执', async () => {
    const uploadedSession = {
      id: 'cover-upload-1',
      assetId: 'asset-1',
      objectKey: 'assets/asset-1/cover/new-cover.png',
      purpose: 'cover',
      status: 'uploaded',
    };
    const completedSession = { ...uploadedSession, status: 'completed' };
    const transaction = {
      uploadSession: {
        findUnique: vi.fn().mockResolvedValue(uploadedSession),
        updateMany: vi.fn().mockResolvedValue({ count: 0 }),
      },
      assetFile: { create: vi.fn() },
      asset: { update: vi.fn() },
    };
    const prisma = {
      uploadSession: {
        findUnique: vi.fn().mockResolvedValue(completedSession),
      },
      assetFile: {
        findUnique: vi.fn().mockResolvedValue({ id: 'new-cover-file' }),
      },
      $transaction: vi.fn(
        async (callback: (client: typeof transaction) => Promise<unknown>) =>
          callback(transaction),
      ),
    } as unknown as PrismaService;
    const minio = {
      completeMultipartUpload: vi.fn(),
    } as unknown as MinioService;
    const service = new UploadService(
      prisma,
      minio,
      {} as QueueService,
      () => now,
    );

    await expect(
      service.complete('cover-upload-1', {
        parts: [{ partNumber: 1, etag: 'etag-cover-1' }],
      }),
    ).resolves.toEqual({
      assetId: 'asset-1',
      fileId: 'new-cover-file',
      status: 'ready',
    });
    expect(transaction.uploadSession.updateMany).toHaveBeenCalledWith({
      where: { id: 'cover-upload-1', status: 'uploaded' },
      data: { status: 'finalizing' },
    });
    expect(transaction.assetFile.create).not.toHaveBeenCalled();
    expect(minio.completeMultipartUpload).not.toHaveBeenCalled();
  });

  it('超时停留在 completing 且对象已存在时从 uploaded 恢复收尾', async () => {
    const session = {
      id: 'cover-upload-1',
      assetId: 'asset-1',
      objectKey: 'assets/asset-1/cover/new-cover.png',
      uploadId: 'minio-cover-upload-1',
      fileName: 'new-cover.png',
      mimeType: 'image/png',
      size: 1_024n,
      sha256: SHA256,
      format: 'png',
      purpose: 'cover',
      metadata: {},
      partSize: 5 * 1024 * 1024,
      partCount: 1,
      status: 'completing',
      updatedAt: new Date('2026-07-16T07:54:59.000Z'),
      expiresAt: new Date('2026-07-17T08:00:00.000Z'),
    };
    const transaction = {
      uploadSession: {
        findUnique: vi.fn().mockResolvedValue(session),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      assetFile: {
        create: vi.fn().mockResolvedValue({ id: 'new-cover-file' }),
      },
      asset: { update: vi.fn().mockResolvedValue({ id: 'asset-1' }) },
    };
    const prisma = {
      uploadSession: {
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      $transaction: vi.fn(
        async (callback: (client: typeof transaction) => Promise<unknown>) =>
          callback(transaction),
      ),
    } as unknown as PrismaService;
    const minio = {
      objectExists: vi.fn().mockResolvedValue(true),
      completeMultipartUpload: vi.fn(),
    } as unknown as MinioService;
    const service = new UploadService(
      prisma,
      minio,
      {} as QueueService,
      () => now,
    );

    await expect(
      service.complete('cover-upload-1', {
        parts: [{ partNumber: 1, etag: 'etag-cover-1' }],
      }),
    ).resolves.toEqual({
      assetId: 'asset-1',
      fileId: 'new-cover-file',
      status: 'ready',
    });
    expect(minio.objectExists).toHaveBeenCalledWith(session.objectKey);
    expect(prisma.uploadSession.updateMany).toHaveBeenCalledWith({
      where: {
        id: 'cover-upload-1',
        status: 'completing',
        updatedAt: session.updatedAt,
      },
      data: { status: 'uploaded' },
    });
    expect(minio.completeMultipartUpload).not.toHaveBeenCalled();
  });

  it('取消封面会话时不改写模型状态', async () => {
    const session = {
      id: 'cover-upload-1',
      assetId: 'asset-1',
      objectKey: 'assets/asset-1/cover/new-cover.png',
      uploadId: 'minio-cover-upload-1',
      purpose: 'cover',
      status: 'uploading',
    };
    const transaction = {
      uploadSession: {
        deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      asset: {
        findUnique: vi.fn().mockResolvedValue({
          id: 'asset-1',
          activeFileId: 'source-file-1',
          files: [{ id: 'source-file-1' }],
        }),
        update: vi.fn(),
        delete: vi.fn(),
      },
    };
    const prisma = {
      uploadSession: {
        findUnique: vi.fn().mockResolvedValue(session),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      $transaction: vi.fn(
        async (callback: (client: typeof transaction) => Promise<unknown>) =>
          callback(transaction),
      ),
    } as unknown as PrismaService;
    const minio = {
      abortMultipartUpload: vi.fn().mockResolvedValue(undefined),
    } as unknown as MinioService;
    const service = new UploadService(
      prisma,
      minio,
      {} as QueueService,
      () => now,
    );

    await service.cancel('cover-upload-1');

    expect(transaction.uploadSession.deleteMany).toHaveBeenCalledWith({
      where: {
        id: 'cover-upload-1',
        status: 'cancelling',
        updatedAt: now,
      },
    });
    expect(transaction.asset.findUnique).not.toHaveBeenCalled();
    expect(transaction.asset.update).not.toHaveBeenCalled();
    expect(transaction.asset.delete).not.toHaveBeenCalled();
  });

  it('完成流程已开始时取消不会抢占会话或中止对象', async () => {
    const session = {
      id: 'cover-upload-1',
      assetId: 'asset-1',
      objectKey: 'assets/asset-1/cover/new-cover.png',
      uploadId: 'minio-cover-upload-1',
      purpose: 'cover',
      status: 'completing',
    };
    const prisma = {
      uploadSession: {
        findUnique: vi.fn().mockResolvedValue(session),
        updateMany: vi.fn().mockResolvedValue({ count: 0 }),
      },
    } as unknown as PrismaService;
    const minio = { abortMultipartUpload: vi.fn() } as unknown as MinioService;
    const service = new UploadService(
      prisma,
      minio,
      {} as QueueService,
      () => now,
    );

    await expect(service.cancel('cover-upload-1')).rejects.toBeInstanceOf(
      ConflictException,
    );

    expect(prisma.uploadSession.updateMany).not.toHaveBeenCalled();
    expect(minio.abortMultipartUpload).not.toHaveBeenCalled();
  });

  it('另一个取消请求仍持有租约时返回冲突而不是误报成功', async () => {
    const session = {
      id: 'cover-upload-1',
      assetId: 'asset-1',
      objectKey: 'assets/asset-1/cover/new-cover.png',
      uploadId: 'minio-cover-upload-1',
      purpose: 'cover',
      status: 'cancelling',
      updatedAt: new Date('2026-07-16T07:59:59.000Z'),
    };
    const prisma = {
      uploadSession: {
        findUnique: vi.fn().mockResolvedValue(session),
        updateMany: vi.fn(),
      },
    } as unknown as PrismaService;
    const minio = { abortMultipartUpload: vi.fn() } as unknown as MinioService;
    const service = new UploadService(
      prisma,
      minio,
      {} as QueueService,
      () => now,
    );

    await expect(service.cancel('cover-upload-1')).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'UPLOAD_NOT_CANCELLABLE' }),
    });
    expect(prisma.uploadSession.updateMany).not.toHaveBeenCalled();
    expect(minio.abortMultipartUpload).not.toHaveBeenCalled();
  });

  it('取消对象失败时恢复 uploading 以便再次取消', async () => {
    const session = {
      id: 'cover-upload-1',
      assetId: 'asset-1',
      objectKey: 'assets/asset-1/cover/new-cover.png',
      uploadId: 'minio-cover-upload-1',
      purpose: 'cover',
      status: 'uploading',
    };
    const prisma = {
      uploadSession: {
        findUnique: vi.fn().mockResolvedValue(session),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
    } as unknown as PrismaService;
    const minio = {
      abortMultipartUpload: vi
        .fn()
        .mockRejectedValue(new Error('minio unavailable')),
    } as unknown as MinioService;
    const service = new UploadService(
      prisma,
      minio,
      {} as QueueService,
      () => now,
    );

    await expect(service.cancel('cover-upload-1')).rejects.toThrow(
      'minio unavailable',
    );
    expect(prisma.uploadSession.updateMany).toHaveBeenLastCalledWith({
      where: {
        id: 'cover-upload-1',
        status: 'cancelling',
        updatedAt: now,
      },
      data: { status: 'uploading' },
    });
  });

  it('超时停留在 cancelling 的会话可重新中止并清理', async () => {
    const session = {
      id: 'cover-upload-1',
      assetId: 'asset-1',
      objectKey: 'assets/asset-1/cover/new-cover.png',
      uploadId: 'minio-cover-upload-1',
      purpose: 'cover',
      status: 'cancelling',
      updatedAt: new Date('2026-07-16T07:54:59.000Z'),
    };
    const transaction = {
      uploadSession: {
        deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      asset: { findUnique: vi.fn(), update: vi.fn(), delete: vi.fn() },
    };
    const prisma = {
      uploadSession: {
        findUnique: vi.fn().mockResolvedValue(session),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      $transaction: vi.fn(
        async (callback: (client: typeof transaction) => Promise<unknown>) =>
          callback(transaction),
      ),
    } as unknown as PrismaService;
    const minio = {
      abortMultipartUpload: vi.fn().mockResolvedValue(undefined),
    } as unknown as MinioService;
    const service = new UploadService(
      prisma,
      minio,
      {} as QueueService,
      () => now,
    );

    await service.cancel('cover-upload-1');

    expect(prisma.uploadSession.updateMany).toHaveBeenCalledWith({
      where: {
        id: 'cover-upload-1',
        status: 'cancelling',
        updatedAt: session.updatedAt,
      },
      data: { updatedAt: now },
    });
    expect(minio.abortMultipartUpload).toHaveBeenCalledWith(
      session.objectKey,
      session.uploadId,
    );
    expect(transaction.uploadSession.deleteMany).toHaveBeenCalledWith({
      where: {
        id: 'cover-upload-1',
        status: 'cancelling',
        updatedAt: now,
      },
    });
  });
});
