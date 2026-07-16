import type { AnalyzeAssetJobData } from '@digital-twin/api-contracts';
import { PrismaClient } from '@prisma/client';
import { Client } from 'minio';
import type {
  AssetAnalysisRepository,
  AssetStorage,
  ReadyAssetInput,
} from './jobs/analyzeAsset.js';

/** Worker 复用单一 Prisma 连接池，任务级原子性由仓储方法内部事务保证。 */
export class PrismaAssetAnalysisRepository implements AssetAnalysisRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async markProcessing(
    assetId: string,
    processingJobId?: string,
  ): Promise<void> {
    await this.prisma.$transaction(async (transaction) => {
      await transaction.asset.update({
        where: { id: assetId },
        data: { status: 'processing', error: null },
      });
      if (processingJobId) {
        await transaction.processingJob.updateMany({
          where: { id: processingJobId },
          data: { status: 'processing', progress: 5, error: null },
        });
      }
    });
  }

  async markReady(input: ReadyAssetInput): Promise<void> {
    await this.prisma.$transaction(async (transaction) => {
      const source = await transaction.assetFile.findFirst({
        where: { id: input.fileId, assetId: input.assetId, role: 'source' },
        select: { id: true },
      });
      if (!source) throw new Error('源文件不属于目标资源，拒绝切换 activeFile');

      // 数据库只保留当前缩略图记录；旧 MinIO 对象由后续无效对象清理任务回收。
      await transaction.assetFile.deleteMany({
        where: { assetId: input.assetId, role: 'thumbnail' },
      });
      await transaction.assetFile.create({
        data: {
          assetId: input.assetId,
          role: 'thumbnail',
          objectKey: input.thumbnailKey,
          mimeType: 'image/svg+xml',
          size: BigInt(input.thumbnailSize),
          checksum: input.thumbnailChecksum,
        },
      });
      await transaction.asset.update({
        where: { id: input.assetId },
        data: {
          status: 'ready',
          activeFileId: input.fileId,
          sourceHash: input.sourceHash,
          metadata: { ...input.metadata },
          error: null,
        },
      });
      if (input.processingJobId) {
        await transaction.processingJob.updateMany({
          where: { id: input.processingJobId },
          data: { status: 'completed', progress: 100, error: null },
        });
      }
    });
  }

  async markFailed(
    assetId: string,
    processingJobId: string | undefined,
    error: string,
  ): Promise<void> {
    const message = error.slice(0, 4_000);
    await this.prisma.$transaction(async (transaction) => {
      await transaction.asset.updateMany({
        where: { id: assetId },
        data: { status: 'failed', error: message },
      });
      if (processingJobId) {
        await transaction.processingJob.updateMany({
          where: { id: processingJobId },
          data: { status: 'failed', error: message },
        });
      }
    });
  }
}

/** MinIO 流式适配器，不向解析器暴露 bucket、凭据和 SDK 内部方法。 */
export class MinioAssetStorage implements AssetStorage {
  private readonly bucket = process.env.MINIO_BUCKET ?? 'assets';
  private readonly client = new Client({
    endPoint: process.env.MINIO_ENDPOINT ?? '127.0.0.1',
    port: Number(process.env.MINIO_PORT ?? 9000),
    useSSL: process.env.MINIO_USE_SSL === 'true',
    accessKey: process.env.MINIO_ACCESS_KEY ?? 'digital-twin',
    secretKey: process.env.MINIO_SECRET_KEY ?? 'digital-twin-secret',
  });

  getObject(objectKey: string): Promise<AsyncIterable<Uint8Array | string>> {
    return this.client.getObject(this.bucket, objectKey);
  }

  async putObject(
    objectKey: string,
    body: Buffer,
    mimeType: string,
  ): Promise<void> {
    await this.client.putObject(this.bucket, objectKey, body, body.length, {
      'Content-Type': mimeType,
    });
  }
}

export function createWorkerInfrastructure(): {
  prisma: PrismaClient;
  storage: AssetStorage;
  repository: AssetAnalysisRepository;
} {
  const prisma = new PrismaClient();
  return {
    prisma,
    storage: new MinioAssetStorage(),
    repository: new PrismaAssetAnalysisRepository(prisma),
  };
}

/** 该别名使 main.ts 的队列泛型与共享契约保持一致。 */
export type AssetQueuePayload = AnalyzeAssetJobData;
