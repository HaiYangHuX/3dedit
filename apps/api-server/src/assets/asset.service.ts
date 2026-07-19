import {
  assetFormatSchema,
  assetKindSchema,
  assetMetadataSchema,
  assetStatusSchema,
  type Asset,
  type AssetDetail,
  type AssetListResponse,
  type ListAssetsQuery,
  type UpdateAssetInput,
} from '@digital-twin/api-contracts';
import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, type AssetFile } from '@prisma/client';
import { MinioService } from '../infrastructure/minio.service.js';
import { PrismaService } from '../infrastructure/prisma.service.js';

type AssetRow = Prisma.AssetGetPayload<{
  include: {
    files: true;
    activeFile: true;
    coverAsset: { include: { files: true; activeFile: true } };
  };
}>;

function extractReferences(document: unknown): string[] {
  if (!document || typeof document !== 'object' || Array.isArray(document)) {
    return [];
  }
  const references = (document as Record<string, unknown>).assetReferences;
  if (!Array.isArray(references)) return [];
  return references.flatMap((reference) => {
    if (
      !reference ||
      typeof reference !== 'object' ||
      Array.isArray(reference)
    ) {
      return [];
    }
    const assetId = (reference as Record<string, unknown>).assetId;
    return typeof assetId === 'string' ? [assetId] : [];
  });
}

function buildReferenceCounts(
  scenes: { document: unknown }[],
): Map<string, number> {
  const counts = new Map<string, number>();
  for (const scene of scenes) {
    // 同一场景内 nodeIds 数量即使异常也只计一次，删除保护只关心是否被引用。
    for (const assetId of new Set(extractReferences(scene.document))) {
      counts.set(assetId, (counts.get(assetId) ?? 0) + 1);
    }
  }
  return counts;
}

/** 模型库目录服务，负责 DTO 映射、引用计数与删除安全边界。 */
@Injectable()
export class AssetService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(MinioService) private readonly minio: MinioService,
  ) {}

  async list(query: ListAssetsQuery): Promise<AssetListResponse> {
    const where: Prisma.AssetWhereInput = {
      kind: query.kind,
      category: query.category,
      status: query.status,
      favorite: query.favorite,
      ...(query.keyword
        ? {
            OR: [
              { name: { contains: query.keyword, mode: 'insensitive' } },
              { code: { contains: query.keyword, mode: 'insensitive' } },
              {
                description: { contains: query.keyword, mode: 'insensitive' },
              },
              {
                manufacturer: {
                  contains: query.keyword,
                  mode: 'insensitive',
                },
              },
              { tags: { has: query.keyword } },
            ],
          }
        : {}),
    };
    const [total, assets, scenes] = await Promise.all([
      this.prisma.asset.count({ where }),
      this.prisma.asset.findMany({
        where,
        include: {
          files: true,
          activeFile: true,
          coverAsset: { include: { files: true, activeFile: true } },
        },
        orderBy: { updatedAt: 'desc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.scene.findMany({ select: { document: true } }),
    ]);
    const references = buildReferenceCounts(scenes);
    return {
      items: await Promise.all(
        assets.map((asset) =>
          this.mapAsset(asset, references.get(asset.id) ?? 0),
        ),
      ),
      total,
      page: query.page,
      pageSize: query.pageSize,
    };
  }

  async get(id: string): Promise<AssetDetail> {
    const [asset, scenes] = await Promise.all([
      this.prisma.asset.findUnique({
        where: { id },
        include: {
          files: true,
          activeFile: true,
          coverAsset: { include: { files: true, activeFile: true } },
        },
      }),
      this.prisma.scene.findMany({ select: { document: true } }),
    ]);
    if (!asset) throw new NotFoundException('资源不存在');
    const references = buildReferenceCounts(scenes);
    const summary = await this.mapAsset(asset, references.get(id) ?? 0);
    return {
      ...summary,
      files: await Promise.all(
        (asset.files ?? []).map(async (file) => ({
          ...this.mapFile(file),
          downloadUrl: await this.minio.presignGet(file.objectKey),
        })),
      ),
    };
  }

  async update(id: string, input: UpdateAssetInput): Promise<AssetDetail> {
    const exists = await this.prisma.asset.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!exists) throw new NotFoundException('资源不存在');
    await this.prisma.asset.update({ where: { id }, data: input });
    return this.get(id);
  }

  async remove(id: string): Promise<void> {
    await this.prisma.$transaction(
      async (transaction) => {
        const asset = await transaction.asset.findUnique({ where: { id } });
        if (!asset) throw new NotFoundException('资源不存在');
        const scenes = await transaction.scene.findMany({
          select: { document: true },
        });
        const referenceCount = buildReferenceCounts(scenes).get(id) ?? 0;
        if (referenceCount > 0) {
          throw new ConflictException({
            code: 'ASSET_IN_USE',
            message: `资源已被 ${referenceCount} 个场景引用，无法删除`,
          });
        }
        await transaction.asset.delete({ where: { id } });
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
    // 对象存储不参与 PostgreSQL 事务；先删数据库防止新引用，对象失败由无效资源清理任务收敛。
    await this.minio.removePrefix(`assets/${id}/`);
  }

  private async mapAsset(
    asset: AssetRow,
    referenceCount: number,
  ): Promise<Asset> {
    const files = asset.files ?? [];
    const thumbnail = files.find((file) => file.role === 'thumbnail');
    // 自定义封面优先返回原图源文件；未配置封面时才回退模型解析出的缩略图。
    const coverFiles =
      asset.coverAsset &&
      (asset.coverAsset.kind === 'image' || !asset.coverAsset.kind)
        ? asset.coverAsset.files
        : undefined;
    const coverThumbnail =
      asset.coverAsset?.activeFile ??
      coverFiles?.find((file) => file.role === 'source') ??
      coverFiles?.find((file) => file.role === 'thumbnail');
    const thumbnailUrl = thumbnail
      ? await this.minio.presignGet(thumbnail.objectKey)
      : null;
    const coverUrl = coverThumbnail
      ? await this.minio.presignGet(coverThumbnail.objectKey)
      : thumbnailUrl;
    return {
      id: asset.id,
      name: asset.name,
      code: asset.code ?? '',
      description: asset.description ?? '',
      kind: assetKindSchema.parse(asset.kind),
      format: assetFormatSchema.parse(asset.format),
      status: assetStatusSchema.parse(asset.status),
      category: asset.category ?? '未分类',
      tags: asset.tags ?? [],
      favorite: asset.favorite ?? false,
      version: asset.version ?? '1.0.0',
      author: asset.author ?? '',
      manufacturer: asset.manufacturer ?? '',
      license: asset.license ?? '内部资产',
      unit: asset.unit ?? 'm',
      scale: asset.scale ?? 1,
      visibility: (asset.visibility ?? 'private') as Asset['visibility'],
      coverAssetId: asset.coverAssetId ?? null,
      coverUrl,
      sourceHash: asset.sourceHash,
      metadata: assetMetadataSchema.parse(asset.metadata),
      error: asset.error,
      retryCount: asset.retryCount,
      thumbnailUrl,
      sourceSize: Number(asset.activeFile?.size ?? 0n),
      referenceCount,
      createdAt: asset.createdAt.toISOString(),
      updatedAt: asset.updatedAt.toISOString(),
    };
  }

  private mapFile(file: AssetFile) {
    return {
      id: file.id,
      role: file.role,
      objectKey: file.objectKey,
      mimeType: file.mimeType,
      size: Number(file.size),
      checksum: file.checksum,
    };
  }
}
