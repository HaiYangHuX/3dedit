import {
  type CompleteUploadInput,
  type CreateUploadInput,
  type AnalyzeAssetJobData,
  type UploadCompletion,
  type UploadSession,
} from '@digital-twin/api-contracts';
import {
  ConflictException,
  GoneException,
  Inject,
  Injectable,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import type { UploadSession as UploadSessionRow } from '@prisma/client';
import { MinioService } from '../infrastructure/minio.service.js';
import { QueueService } from '../infrastructure/queue.service.js';
import { PrismaService } from '../infrastructure/prisma.service.js';

const MEBIBYTE = 1024 * 1024;
const MIN_PART_SIZE = 5 * MEBIBYTE;
const MAX_PART_COUNT = 10_000;
const SESSION_TTL_MS = 24 * 60 * 60 * 1_000;

export const UPLOAD_CLOCK = Symbol('UPLOAD_CLOCK');

function calculatePartSize(size: number): number {
  const minimumForPartLimit = Math.ceil(size / MAX_PART_COUNT);
  const roundedToMebibyte =
    Math.ceil(minimumForPartLimit / MEBIBYTE) * MEBIBYTE;
  return Math.max(MIN_PART_SIZE, roundedToMebibyte);
}

/**
 * 只保留最后一级文件名，并过滤路径控制符。
 * Unicode 中文名称可读性较好，因此不强制转为 ASCII；连续危险字符统一压成短横线。
 */
function sanitizeFileName(fileName: string): string {
  const baseName = fileName.replaceAll('\\', '/').split('/').at(-1) ?? 'asset';
  const sanitized = baseName
    .normalize('NFKC')
    .replace(/[^\p{L}\p{N}._-]+/gu, '-')
    .replace(/^[.-]+|[.-]+$/g, '')
    .slice(0, 180);
  return sanitized || 'asset';
}

function validateParts(
  session: UploadSessionRow,
  parts: CompleteUploadInput['parts'],
): void {
  if (parts.length !== session.partCount) {
    throw new ConflictException({
      code: 'UPLOAD_PARTS_MISMATCH',
      message: `分片数量应为 ${session.partCount}，实际收到 ${parts.length}`,
    });
  }
  for (let index = 0; index < parts.length; index += 1) {
    if (parts[index]?.partNumber !== index + 1) {
      throw new ConflictException({
        code: 'UPLOAD_PARTS_MISMATCH',
        message: 'partNumber 必须从 1 连续递增',
      });
    }
  }
}

/** 分片上传编排服务：数据库保存状态，文件字节始终由浏览器直传 MinIO。 */
@Injectable()
export class UploadService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(MinioService) private readonly minio: MinioService,
    @Inject(QueueService) private readonly queue: QueueService,
    @Optional()
    @Inject(UPLOAD_CLOCK)
    private readonly now: () => Date = () => new Date(),
  ) {}

  async create(input: CreateUploadInput): Promise<UploadSession> {
    const isReplacement = Boolean(input.assetId);
    let asset: { id: string; activeFile?: { objectKey: string } | null };

    if (input.assetId) {
      const existing = await this.prisma.asset.findUnique({
        where: { id: input.assetId },
        include: { activeFile: true },
      });
      if (!existing) throw new NotFoundException('待替换资源不存在');
      asset = existing;
    } else {
      const duplicate = await this.prisma.asset.findUnique({
        where: { sourceHash: input.sha256 },
        select: { id: true },
      });
      if (duplicate) {
        throw new ConflictException({
          code: 'ASSET_ALREADY_EXISTS',
          message: '相同内容的资源已存在模型库中',
          assetId: duplicate.id,
        });
      }
      asset = await this.prisma.asset.create({
        data: {
          name: input.name,
          kind: input.kind,
          format: input.format,
          status: 'uploading',
          sourceHash: input.sha256,
          category: input.category,
          tags: input.tags,
        },
      });
    }

    const safeName = sanitizeFileName(input.fileName);
    // 替换上传不能覆盖仍在使用的源对象；仅同名冲突时追加时间戳形成候选文件。
    const storedName =
      asset.activeFile?.objectKey === `assets/${asset.id}/source/${safeName}`
        ? `${this.now().getTime()}-${safeName}`
        : safeName;
    const objectKey = `assets/${asset.id}/source/${storedName}`;
    const partSize = calculatePartSize(input.size);
    const partCount = Math.ceil(input.size / partSize);
    const expiresAt = new Date(this.now().getTime() + SESSION_TTL_MS);
    let uploadId: string | undefined;

    try {
      uploadId = await this.minio.createMultipartUpload(
        objectKey,
        input.mimeType,
      );
      const session = await this.prisma.uploadSession.create({
        data: {
          assetId: asset.id,
          fileName: input.fileName,
          mimeType: input.mimeType,
          size: BigInt(input.size),
          sha256: input.sha256,
          format: input.format,
          objectKey,
          uploadId,
          partSize,
          partCount,
          expiresAt,
        },
      });
      if (isReplacement) {
        await this.prisma.asset.update({
          where: { id: asset.id },
          data: { status: 'uploading', error: null },
        });
      }
      const partUrls = await Promise.all(
        Array.from({ length: partCount }, async (_, index) => ({
          partNumber: index + 1,
          url: await this.minio.presignUploadPart(
            objectKey,
            uploadId as string,
            index + 1,
          ),
        })),
      );
      return {
        id: session.id,
        assetId: asset.id,
        objectKey,
        partSize,
        partCount,
        partUrls,
        expiresAt: expiresAt.toISOString(),
      };
    } catch (error) {
      if (uploadId) {
        await this.minio
          .abortMultipartUpload(objectKey, uploadId)
          .catch(() => undefined);
      }
      if (!isReplacement) {
        // 新资源尚未被场景引用，初始化失败时删除占位行，避免模型库长期出现幽灵记录。
        await this.prisma.asset
          .delete({ where: { id: asset.id } })
          .catch(() => undefined);
      }
      throw error;
    }
  }

  async complete(
    id: string,
    input: CompleteUploadInput,
  ): Promise<UploadCompletion> {
    const parts = [...input.parts].sort(
      (first, second) => first.partNumber - second.partNumber,
    );
    const claim = await this.prisma.$transaction(async (transaction) => {
      const session = await transaction.uploadSession.findUnique({
        where: { id },
      });
      if (!session) throw new NotFoundException('上传会话不存在');
      if (session.status === 'completed') return { session, completed: true };
      if (session.status !== 'uploading') {
        throw new ConflictException({
          code: 'UPLOAD_NOT_COMPLETABLE',
          message: '上传会话正在完成、已取消或状态异常',
        });
      }
      if (session.expiresAt.getTime() <= this.now().getTime()) {
        throw new GoneException({
          code: 'UPLOAD_EXPIRED',
          message: '上传会话已过期',
        });
      }
      validateParts(session, parts);
      const updated = await transaction.uploadSession.updateMany({
        where: { id, status: 'uploading' },
        data: { status: 'completing' },
      });
      if (updated.count !== 1) {
        throw new ConflictException({
          code: 'UPLOAD_ALREADY_COMPLETING',
          message: '上传会话正在由另一个请求完成',
        });
      }
      return { session, completed: false };
    });

    if (claim.completed) return this.resumeCompleted(claim.session);

    try {
      await this.minio.completeMultipartUpload(
        claim.session.objectKey,
        claim.session.uploadId,
        parts,
      );
    } catch (error) {
      // MinIO 完成失败通常可重试，将状态恢复为 uploading，客户端可重复提交同一 ETag 集合。
      await this.prisma.uploadSession.updateMany({
        where: { id, status: 'completing' },
        data: { status: 'uploading' },
      });
      throw error;
    }

    const completion = await this.prisma.$transaction(async (transaction) => {
      const file = await transaction.assetFile.create({
        data: {
          assetId: claim.session.assetId,
          role: 'source',
          objectKey: claim.session.objectKey,
          mimeType: claim.session.mimeType,
          size: claim.session.size,
          checksum: claim.session.sha256,
        },
      });
      await transaction.asset.update({
        where: { id: claim.session.assetId },
        data: { status: 'queued', error: null },
      });
      const jobData: AnalyzeAssetJobData = {
        assetId: claim.session.assetId,
        fileId: file.id,
        objectKey: claim.session.objectKey,
        expectedSha256: claim.session.sha256,
      };
      const job = await transaction.processingJob.create({
        data: {
          assetId: claim.session.assetId,
          type: 'analyze-asset',
          status: 'queued',
          payload: { ...jobData, uploadSessionId: id },
        },
      });
      await transaction.uploadSession.updateMany({
        where: { id, status: 'completing' },
        data: { status: 'completed' },
      });
      return { file, job, jobData };
    });

    await this.enqueueOrMarkFailed(
      claim.session.assetId,
      completion.job.id,
      completion.jobData,
    );
    return {
      assetId: claim.session.assetId,
      fileId: completion.file.id,
      jobId: completion.job.id,
      status: 'queued',
    };
  }

  async cancel(id: string): Promise<void> {
    const session = await this.prisma.uploadSession.findUnique({
      where: { id },
    });
    if (!session) return;
    if (session.status === 'completed') {
      throw new ConflictException('已完成的上传不能取消');
    }
    const claimed = await this.prisma.uploadSession.updateMany({
      where: { id, status: { in: ['uploading', 'completing'] } },
      data: { status: 'cancelling' },
    });
    if (claimed.count === 0) return;
    await this.minio.abortMultipartUpload(session.objectKey, session.uploadId);
    await this.prisma.$transaction(async (transaction) => {
      await transaction.uploadSession.delete({ where: { id } });
      const asset = await transaction.asset.findUnique({
        where: { id: session.assetId },
        include: { files: { take: 1 } },
      });
      // 首次上传取消且从未生成文件时一并删除占位资源；替换上传保留原 activeFile。
      if (asset && !asset.activeFileId && asset.files.length === 0) {
        await transaction.asset.delete({ where: { id: asset.id } });
      } else if (asset) {
        await transaction.asset.update({
          where: { id: asset.id },
          data: { status: asset.activeFileId ? 'ready' : 'failed' },
        });
      }
    });
  }

  async retry(assetId: string): Promise<UploadCompletion> {
    const asset = await this.prisma.asset.findUnique({
      where: { id: assetId },
      include: {
        activeFile: true,
        files: {
          where: { role: 'source' },
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
    });
    if (!asset) throw new NotFoundException('资源不存在');
    if (asset.status !== 'failed') {
      throw new ConflictException({
        code: 'ASSET_NOT_FAILED',
        message: '只有解析失败的资源才能重试',
      });
    }
    const file = asset.files[0] ?? asset.activeFile;
    if (!file) throw new ConflictException('资源没有可重试的源文件');

    const result = await this.prisma.$transaction(async (transaction) => {
      const claimed = await transaction.asset.updateMany({
        where: { id: assetId, status: 'failed' },
        data: { status: 'queued', error: null, retryCount: { increment: 1 } },
      });
      if (claimed.count !== 1) {
        throw new ConflictException('资源已被其他请求重试');
      }
      const jobData: AnalyzeAssetJobData = {
        assetId,
        fileId: file.id,
        objectKey: file.objectKey,
        expectedSha256: file.checksum,
      };
      const job = await transaction.processingJob.create({
        data: {
          assetId,
          type: 'analyze-asset',
          status: 'queued',
          payload: { ...jobData },
        },
      });
      return { job, jobData };
    });
    await this.enqueueOrMarkFailed(assetId, result.job.id, result.jobData);
    return { assetId, fileId: file.id, jobId: result.job.id, status: 'queued' };
  }

  private async resumeCompleted(
    session: UploadSessionRow,
  ): Promise<UploadCompletion> {
    const [file, job] = await Promise.all([
      this.prisma.assetFile.findUnique({
        where: { objectKey: session.objectKey },
      }),
      this.prisma.processingJob.findFirst({
        where: {
          assetId: session.assetId,
          type: 'analyze-asset',
          payload: { path: ['uploadSessionId'], equals: session.id },
        },
        orderBy: { createdAt: 'desc' },
      }),
    ]);
    if (!file || !job)
      throw new ConflictException('上传完成记录不完整，请稍后重试');
    const jobData: AnalyzeAssetJobData = {
      assetId: session.assetId,
      fileId: file.id,
      objectKey: session.objectKey,
      expectedSha256: session.sha256,
    };
    await this.enqueueOrMarkFailed(session.assetId, job.id, jobData);
    return {
      assetId: session.assetId,
      fileId: file.id,
      jobId: job.id,
      status: 'queued',
    };
  }

  private async enqueueOrMarkFailed(
    assetId: string,
    jobId: string,
    data: AnalyzeAssetJobData,
  ): Promise<void> {
    try {
      await this.queue.enqueueAssetAnalysis(data, jobId);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : '任务队列投递失败';
      // 数据库任务是可恢复的 outbox 记录；失败状态允许用户重试，而不会丢失源文件。
      await this.prisma.$transaction([
        this.prisma.processingJob.update({
          where: { id: jobId },
          data: { status: 'failed', error: message },
        }),
        this.prisma.asset.update({
          where: { id: assetId },
          data: { status: 'failed', error: message },
        }),
      ]);
      throw error;
    }
  }
}
