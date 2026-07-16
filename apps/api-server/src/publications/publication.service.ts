import {
  publicationManifestSchema,
  type PublicationAssetEntry,
  type PublicationDetail,
  type PublicationManifest,
  type PublishSceneInput,
} from '@digital-twin/api-contracts';
import { sceneDocumentSchema } from '@digital-twin/scene-schema';
import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import type { Asset, AssetFile, Publication } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { MinioService } from '../infrastructure/minio.service.js';
import { PrismaService } from '../infrastructure/prisma.service.js';
import { hashSceneDocument } from '../scenes/scene-document.js';

type PublishedAsset = Pick<
  Asset,
  'id' | 'name' | 'kind' | 'format' | 'status'
> & { activeFile: AssetFile | null };

const runtimeBaseUrl = (
  process.env.RUNTIME_PUBLIC_BASE_URL ?? 'http://127.0.0.1:5174'
).replace(/\/$/, '');
const apiBaseUrl = (
  process.env.API_PUBLIC_BASE_URL ?? 'http://127.0.0.1:3000/api'
).replace(/\/$/, '');

function mapDetail(publication: Publication): PublicationDetail {
  const runtimeUrl = `${runtimeBaseUrl}/runtime/${encodeURIComponent(publication.id)}`;
  return {
    id: publication.id,
    projectId: publication.projectId,
    sceneId: publication.sceneId,
    status: 'active',
    contentHash: publication.contentHash,
    publishedAt: publication.publishedAt.toISOString(),
    runtimeUrl,
    iframeCode: `<iframe src="${runtimeUrl}" width="100%" height="100%" frameborder="0" allowfullscreen></iframe>`,
  };
}

function collectAssetIds(
  document: ReturnType<typeof sceneDocumentSchema.parse>,
): string[] {
  const ids = new Set<string>();
  for (const node of Object.values(document.nodes)) {
    for (const component of node.components) {
      if (component.kind === 'model') ids.add(component.assetId);
    }
  }
  if (document.settings.environmentAssetId) {
    ids.add(document.settings.environmentAssetId);
  }
  return [...ids].sort();
}

/** 生成独立发布包，并以 projectId 唯一行作为当前线上指针。 */
@Injectable()
export class PublicationService {
  private readonly logger = new Logger(PublicationService.name);

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(MinioService) private readonly minio: MinioService,
  ) {}

  async publish(
    projectId: string,
    input: PublishSceneInput,
  ): Promise<PublicationDetail> {
    const scene = await this.prisma.scene.findUnique({
      where: { id: input.sceneId },
    });
    if (!scene) throw new NotFoundException('场景不存在');
    if (scene.projectId !== projectId) {
      throw new BadRequestException('场景不属于当前项目');
    }
    const document = sceneDocumentSchema.parse(scene.document);
    const assetIds = collectAssetIds(document);
    const assets = await this.prisma.asset.findMany({
      where: { id: { in: assetIds } },
      include: { activeFile: true },
    });
    this.assertAssetsReady(assetIds, assets);

    const existing = await this.prisma.publication.findUnique({
      where: { projectId },
    });
    const publicationId = existing?.id ?? randomUUID();
    const releaseId = randomUUID();
    const prefix = `publications/${publicationId}/releases/${releaseId}/`;
    const sceneObjectKey = `${prefix}scene.json`;
    const objectKey = `${prefix}manifest.json`;
    const contentHash = scene.contentHash || hashSceneDocument(document);

    try {
      const manifestAssets = await this.copyAssets(
        publicationId,
        prefix,
        assets,
      );
      const manifest = publicationManifestSchema.parse({
        schemaVersion: 1,
        publicationId,
        projectId,
        sceneId: scene.id,
        releaseId,
        contentHash,
        document,
        assets: manifestAssets,
      });
      await this.minio.putJson(sceneObjectKey, document);
      // Manifest 最后写入，避免读取到尚未完整生成的发布包。
      await this.minio.putJson(objectKey, manifest);

      const publication = await this.prisma.$transaction((transaction) =>
        transaction.publication.upsert({
          where: { projectId },
          create: {
            id: publicationId,
            projectId,
            sceneId: scene.id,
            releaseId,
            objectKey,
            sceneObjectKey,
            contentHash,
            status: 'active',
          },
          update: {
            sceneId: scene.id,
            releaseId,
            objectKey,
            sceneObjectKey,
            contentHash,
            status: 'active',
            publishedAt: new Date(),
          },
        }),
      );

      if (existing && existing.releaseId !== releaseId) {
        const oldPrefix = `publications/${publicationId}/releases/${existing.releaseId}/`;
        void this.minio.removePrefix(oldPrefix).catch((error: unknown) => {
          // 指针已成功切换，旧包清理失败只能记录，不能让发布结果回滚成失败。
          this.logger.warn(`旧发布包清理失败: ${oldPrefix}`, error);
        });
      }
      return mapDetail(publication);
    } catch (error) {
      await this.minio.removePrefix(prefix).catch(() => undefined);
      throw error;
    }
  }

  async getCurrent(projectId: string): Promise<PublicationDetail> {
    const publication = await this.prisma.publication.findUnique({
      where: { projectId },
    });
    if (!publication) throw new NotFoundException('项目尚未发布');
    return mapDetail(publication);
  }

  async getManifest(publicationId: string): Promise<PublicationManifest> {
    const publication = await this.requirePublication(publicationId);
    return publicationManifestSchema.parse(
      await this.minio.getJson(publication.objectKey),
    );
  }

  async getAssetUrl(publicationId: string, assetId: string): Promise<string> {
    const manifest = await this.getManifest(publicationId);
    const asset = manifest.assets[assetId];
    if (!asset) throw new NotFoundException('发布资源不存在');
    return this.minio.presignGet(asset.objectKey);
  }

  private assertAssetsReady(
    expectedIds: string[],
    assets: PublishedAsset[],
  ): void {
    const found = new Map(assets.map((asset) => [asset.id, asset]));
    for (const assetId of expectedIds) {
      const asset = found.get(assetId);
      if (!asset || asset.status !== 'ready' || !asset.activeFile) {
        throw new ConflictException({
          code: 'ASSET_NOT_READY',
          message: `发布资源未就绪: ${assetId}`,
        });
      }
    }
  }

  private async copyAssets(
    publicationId: string,
    prefix: string,
    assets: PublishedAsset[],
  ): Promise<Record<string, PublicationAssetEntry>> {
    const result: Record<string, PublicationAssetEntry> = {};
    for (const asset of assets) {
      if (!asset.activeFile) continue;
      const destination = `${prefix}assets/${asset.id}/source.${asset.format}`;
      await this.minio.copyObject(asset.activeFile.objectKey, destination);
      result[asset.id] = {
        name: asset.name,
        format: asset.format as PublicationAssetEntry['format'],
        mimeType: asset.activeFile.mimeType,
        size: Number(asset.activeFile.size),
        objectKey: destination,
        url: `${apiBaseUrl}/publications/${encodeURIComponent(publicationId)}/assets/${encodeURIComponent(asset.id)}`,
      };
    }
    return result;
  }

  private async requirePublication(id: string): Promise<Publication> {
    const publication = await this.prisma.publication.findUnique({
      where: { id },
    });
    if (!publication || publication.status !== 'active') {
      throw new NotFoundException('发布不存在');
    }
    return publication;
  }
}
