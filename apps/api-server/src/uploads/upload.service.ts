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
import type { Prisma, UploadSession as UploadSessionRow } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { MinioService } from '../infrastructure/minio.service.js';
import { QueueService } from '../infrastructure/queue.service.js';
import { PrismaService } from '../infrastructure/prisma.service.js';

const MEBIBYTE = 1024 * 1024;
const MIN_PART_SIZE = 5 * MEBIBYTE;
const MAX_PART_COUNT = 10_000;
const SESSION_TTL_MS = 24 * 60 * 60 * 1_000;
const COMPLETION_LEASE_MS = 5 * 60 * 1_000;

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

/** 把表单元数据快照写入上传会话，替换上传完成前不改变资源当前元数据。 */
function buildAssetMetadataSnapshot(
  input: CreateUploadInput,
  fallbackVersion = '1.0.0',
): Prisma.InputJsonObject {
  return {
    name: input.name,
    code: input.code ?? '',
    description: input.description ?? '',
    kind: input.kind,
    format: input.format,
    category: input.category ?? '未分类',
    tags: input.tags ?? [],
    version: input.version ?? fallbackVersion,
    author: input.author ?? '',
    manufacturer: input.manufacturer ?? '',
    license: input.license ?? '内部资产',
    unit: input.unit ?? 'm',
    scale: input.scale ?? 1,
    visibility: input.visibility ?? 'private',
    ...(input.coverAssetId !== undefined
      ? { coverAssetId: input.coverAssetId }
      : {}),
  };
}

function assetDataFromSnapshot(value: unknown): Prisma.AssetUpdateInput {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const snapshot = value as Record<string, unknown>;
  const allowed = [
    'name',
    'code',
    'description',
    'kind',
    'format',
    'category',
    'tags',
    'version',
    'author',
    'manufacturer',
    'license',
    'unit',
    'scale',
    'visibility',
    'coverAssetId',
  ] as const;
  return Object.fromEntries(
    allowed
      .filter((key) => snapshot[key] !== undefined)
      .map((key) => [key, snapshot[key]]),
  ) as Prisma.AssetUpdateInput;
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
    const isCover = input.purpose === 'cover';
    const isReplacement = Boolean(input.assetId);
    let asset: {
      id: string;
      version?: string;
      activeFile?: { objectKey: string } | null;
    };

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
          code: input.code,
          description: input.description,
          kind: input.kind,
          format: input.format,
          status: 'uploading',
          sourceHash: input.sha256,
          category: input.category,
          tags: input.tags,
          version: input.version,
          author: input.author,
          manufacturer: input.manufacturer,
          license: input.license,
          unit: input.unit,
          scale: input.scale,
          visibility: input.visibility,
          coverAssetId: input.coverAssetId,
        },
      });
    }

    const safeName = sanitizeFileName(input.fileName);
    // 替换上传不能覆盖仍在使用的源对象；仅同名冲突时追加时间戳形成候选文件。
    const storedName = isCover
      ? `${randomUUID()}-${safeName}`
      : asset.activeFile?.objectKey === `assets/${asset.id}/source/${safeName}`
        ? `${this.now().getTime()}-${safeName}`
        : safeName;
    const objectKey = `assets/${asset.id}/${isCover ? 'cover' : 'source'}/${storedName}`;
    const partSize = calculatePartSize(input.size);
    const partCount = Math.ceil(input.size / partSize);
    const expiresAt = new Date(this.now().getTime() + SESSION_TTL_MS);
    let uploadId: string | undefined;
    let sessionId: string | undefined;

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
          purpose: input.purpose,
          metadata: isCover
            ? {}
            : buildAssetMetadataSnapshot(
                input,
                isReplacement ? (asset.version ?? '1.0.0') : '1.0.0',
              ),
          objectKey,
          uploadId,
          partSize,
          partCount,
          expiresAt,
        },
      });
      sessionId = session.id;
      if (isReplacement && !isCover) {
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
      if (sessionId) {
        await this.prisma.uploadSession
          .deleteMany({ where: { id: sessionId, status: 'uploading' } })
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
    const completionStartedAt = this.now();
    const claim = await this.prisma.$transaction(async (transaction) => {
      const session = await transaction.uploadSession.findUnique({
        where: { id },
      });
      if (!session) throw new NotFoundException('上传会话不存在');
      if (session.status === 'completed') {
        return { session, phase: 'completed' as const };
      }
      if (session.status === 'uploaded') {
        return { session, phase: 'uploaded' as const };
      }
      if (session.status === 'completing') {
        const leaseExpired =
          session.updatedAt.getTime() + COMPLETION_LEASE_MS <=
          this.now().getTime();
        if (leaseExpired) {
          return { session, phase: 'recovering' as const };
        }
      }
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
        data: { status: 'completing', updatedAt: completionStartedAt },
      });
      if (updated.count !== 1) {
        throw new ConflictException({
          code: 'UPLOAD_ALREADY_COMPLETING',
          message: '上传会话正在由另一个请求完成',
        });
      }
      return {
        session,
        phase: 'multipart' as const,
        completionStartedAt,
      };
    });

    if (claim.phase === 'completed') {
      return this.resumeCompleted(claim.session);
    }

    if (claim.phase === 'recovering') {
      const objectExists = await this.minio.objectExists(
        claim.session.objectKey,
      );
      const recovered = await this.prisma.uploadSession.updateMany({
        where: {
          id,
          status: 'completing',
          updatedAt: claim.session.updatedAt,
        },
        data: { status: objectExists ? 'uploaded' : 'uploading' },
      });
      if (recovered.count !== 1) {
        throw new ConflictException({
          code: 'UPLOAD_STATE_CHANGED',
          message: '上传会话已由另一个请求恢复，请重试',
        });
      }
      if (!objectExists) return this.complete(id, input);
    }

    if (claim.phase === 'multipart') {
      try {
        await this.minio.completeMultipartUpload(
          claim.session.objectKey,
          claim.session.uploadId,
          parts,
        );
      } catch (error) {
        let objectExists: boolean;
        try {
          objectExists = await this.minio.objectExists(claim.session.objectKey);
        } catch {
          // 无法确认 MinIO 最终状态时保留 completing，租约到期后再恢复。
          throw error;
        }
        if (!objectExists) {
          const restored = await this.prisma.uploadSession.updateMany({
            where: {
              id,
              status: 'completing',
              updatedAt: claim.completionStartedAt,
            },
            data: { status: 'uploading' },
          });
          if (restored.count !== 1) {
            throw new ConflictException({
              code: 'UPLOAD_STATE_CHANGED',
              message: '上传会话已由另一个请求恢复，请重试',
            });
          }
          throw error;
        }
      }

      const persisted = await this.prisma.uploadSession.updateMany({
        where: {
          id,
          status: 'completing',
          updatedAt: claim.completionStartedAt,
        },
        data: { status: 'uploaded' },
      });
      if (persisted.count !== 1) {
        throw new ConflictException({
          code: 'UPLOAD_STATE_CHANGED',
          message: '上传对象已完成，但会话状态发生变化，请重试完成请求',
        });
      }
    }

    if (claim.session.purpose === 'cover') {
      const completion = await this.prisma.$transaction(async (transaction) => {
        const acquired = await transaction.uploadSession.updateMany({
          where: { id, status: 'uploaded' },
          data: { status: 'finalizing' },
        });
        if (acquired.count !== 1) return null;
        const file = await transaction.assetFile.create({
          data: {
            assetId: claim.session.assetId,
            role: 'cover',
            objectKey: claim.session.objectKey,
            mimeType: claim.session.mimeType,
            size: claim.session.size,
            checksum: claim.session.sha256,
          },
        });
        await transaction.asset.update({
          where: { id: claim.session.assetId },
          data: {
            activeCoverFileId: file.id,
            coverAssetId: null,
          },
        });
        const completed = await transaction.uploadSession.updateMany({
          where: { id, status: 'finalizing' },
          data: { status: 'completed' },
        });
        if (completed.count !== 1) {
          throw new ConflictException('上传会话状态已变化，请重试');
        }
        return { file };
      });
      if (!completion) return this.resumeFinalizationRace(id);
      return {
        assetId: claim.session.assetId,
        fileId: completion.file.id,
        status: 'ready',
      };
    }

    const completion = await this.prisma.$transaction(async (transaction) => {
      const acquired = await transaction.uploadSession.updateMany({
        where: { id, status: 'uploaded' },
        data: { status: 'finalizing' },
      });
      if (acquired.count !== 1) return null;
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
        data: {
          status: 'queued',
          error: null,
          ...assetDataFromSnapshot(claim.session.metadata),
        },
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
      const completed = await transaction.uploadSession.updateMany({
        where: { id, status: 'finalizing' },
        data: { status: 'completed' },
      });
      if (completed.count !== 1) {
        throw new ConflictException('上传会话状态已变化，请重试');
      }
      return { file, job, jobData };
    });

    if (!completion) return this.resumeFinalizationRace(id);

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
    const cancellationStartedAt = this.now();
    const claimed =
      session.status === 'uploading'
        ? await this.prisma.uploadSession.updateMany({
            where: { id, status: 'uploading' },
            data: {
              status: 'cancelling',
              updatedAt: cancellationStartedAt,
            },
          })
        : session.status === 'cancelling' &&
            session.updatedAt.getTime() + COMPLETION_LEASE_MS <=
              cancellationStartedAt.getTime()
          ? await this.prisma.uploadSession.updateMany({
              where: {
                id,
                status: 'cancelling',
                updatedAt: session.updatedAt,
              },
              data: { updatedAt: cancellationStartedAt },
            })
          : { count: 0 };
    if (claimed.count === 0) {
      throw new ConflictException({
        code: 'UPLOAD_NOT_CANCELLABLE',
        message: '上传会话正在完成、取消或状态已变化，请稍后重试',
      });
    }
    try {
      await this.minio.abortMultipartUpload(
        session.objectKey,
        session.uploadId,
      );
    } catch (error) {
      await this.prisma.uploadSession.updateMany({
        where: {
          id,
          status: 'cancelling',
          updatedAt: cancellationStartedAt,
        },
        data: { status: 'uploading' },
      });
      throw error;
    }
    await this.prisma.$transaction(async (transaction) => {
      const deleted = await transaction.uploadSession.deleteMany({
        where: {
          id,
          status: 'cancelling',
          updatedAt: cancellationStartedAt,
        },
      });
      if (deleted.count !== 1) return;
      if (session.purpose === 'cover') return;
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
    if (session.purpose === 'cover') {
      const file = await this.prisma.assetFile.findUnique({
        where: { objectKey: session.objectKey },
      });
      if (!file) {
        throw new ConflictException('封面上传完成记录不完整，请稍后重试');
      }
      return {
        assetId: session.assetId,
        fileId: file.id,
        status: 'ready',
      };
    }
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

  private async resumeFinalizationRace(id: string): Promise<UploadCompletion> {
    const session = await this.prisma.uploadSession.findUnique({
      where: { id },
    });
    if (session?.status === 'completed') return this.resumeCompleted(session);
    throw new ConflictException({
      code: 'UPLOAD_ALREADY_FINALIZING',
      message: '上传会话正在由另一个请求完成，请重试',
    });
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
