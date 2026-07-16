import {
  assetDetailSchema,
  sceneDetailSchema,
  type AssetDetail,
  type SceneDetail,
} from '@digital-twin/api-contracts';
import {
  sceneDocumentSchema,
  type SceneDocument,
} from '@digital-twin/scene-schema';
import type { ModelAssetFormat } from '@digital-twin/three-engine';
import { runtimeApiRequest } from './client.js';

export interface PublicationAssetEntry {
  name: string;
  format: ModelAssetFormat;
  mimeType: string;
  size: number;
  objectKey: string;
  url: string;
}

export interface PublicationManifest {
  schemaVersion: 1;
  publicationId: string;
  projectId: string;
  sceneId: string;
  contentHash: string;
  document: SceneDocument;
  assets: Record<string, PublicationAssetEntry>;
}

const modelFormats = new Set<ModelAssetFormat>([
  'glb',
  'gltf',
  'fbx',
  'obj',
  'stl',
  'usdz',
]);

function requiredString(
  value: unknown,
  field: string,
): asserts value is string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`发布 Manifest 字段无效: ${field}`);
  }
}

/** 发布契约正式加入共享包前，运行端仍在网络边界执行同等严格的结构校验。 */
function parseManifest(input: unknown): PublicationManifest {
  if (!input || typeof input !== 'object') {
    throw new Error('发布 Manifest 不是对象');
  }
  const value = input as Record<string, unknown>;
  if (value.schemaVersion !== 1) throw new Error('不支持的发布 Manifest 版本');
  requiredString(value.publicationId, 'publicationId');
  requiredString(value.projectId, 'projectId');
  requiredString(value.sceneId, 'sceneId');
  requiredString(value.contentHash, 'contentHash');
  if (!value.assets || typeof value.assets !== 'object') {
    throw new Error('发布 Manifest 缺少 assets');
  }
  const assets: Record<string, PublicationAssetEntry> = {};
  for (const [assetId, candidate] of Object.entries(value.assets)) {
    if (!candidate || typeof candidate !== 'object') {
      throw new Error(`发布资源结构无效: ${assetId}`);
    }
    const entry = candidate as Record<string, unknown>;
    requiredString(entry.name, `${assetId}.name`);
    requiredString(entry.format, `${assetId}.format`);
    requiredString(entry.mimeType, `${assetId}.mimeType`);
    requiredString(entry.objectKey, `${assetId}.objectKey`);
    requiredString(entry.url, `${assetId}.url`);
    if (!modelFormats.has(entry.format as ModelAssetFormat)) {
      throw new Error(`发布模型格式无效: ${entry.format}`);
    }
    if (typeof entry.size !== 'number' || entry.size < 0) {
      throw new Error(`发布资源大小无效: ${assetId}`);
    }
    assets[assetId] = {
      name: entry.name,
      format: entry.format as ModelAssetFormat,
      mimeType: entry.mimeType,
      size: entry.size,
      objectKey: entry.objectKey,
      url: entry.url,
    };
  }
  return {
    schemaVersion: 1,
    publicationId: value.publicationId,
    projectId: value.projectId,
    sceneId: value.sceneId,
    contentHash: value.contentHash,
    document: sceneDocumentSchema.parse(value.document),
    assets,
  };
}

const idPath = (id: string) => encodeURIComponent(id);

export const runtimeApi = {
  async getPreviewScene(sceneId: string): Promise<SceneDetail> {
    return sceneDetailSchema.parse(
      await runtimeApiRequest(`/scenes/${idPath(sceneId)}`),
    );
  },
  async getAsset(assetId: string): Promise<AssetDetail> {
    return assetDetailSchema.parse(
      await runtimeApiRequest(`/assets/${idPath(assetId)}`),
    );
  },
  async getPublicationManifest(
    publicationId: string,
  ): Promise<PublicationManifest> {
    return parseManifest(
      await runtimeApiRequest(
        `/publications/${idPath(publicationId)}/manifest`,
      ),
    );
  },
};
