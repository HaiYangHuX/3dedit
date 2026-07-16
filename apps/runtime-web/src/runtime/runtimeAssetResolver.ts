import type {
  AssetResolver,
  ModelAssetFormat,
} from '@digital-twin/three-engine';
import type { PublicationManifest } from '../api/runtime.js';

const modelFormats = new Set<ModelAssetFormat>([
  'glb',
  'gltf',
  'fbx',
  'obj',
  'stl',
  'usdz',
]);

interface PreviewAsset {
  id: string;
  name: string;
  kind: string;
  format: string;
  status: string;
  sourceHash: string;
  files: Array<{
    role: string;
    checksum: string;
    downloadUrl?: string;
  }>;
}

export interface PreviewAssetClient {
  getAsset(assetId: string): Promise<PreviewAsset>;
}

/** preview 使用模型库活动文件，但仍严格匹配 sourceHash，不能误读被替换的旧源文件。 */
export function createPreviewAssetResolver(
  client: PreviewAssetClient,
): AssetResolver {
  return {
    async resolve(assetId) {
      const asset = await client.getAsset(assetId);
      if (asset.status !== 'ready') {
        throw new Error(`资源尚未处理完成: ${asset.name}`);
      }
      if (
        asset.kind !== 'model' ||
        !modelFormats.has(asset.format as ModelAssetFormat)
      ) {
        throw new Error(`资源不是可加载的三维模型: ${asset.name}`);
      }
      const source = asset.files.find(
        (file) => file.role === 'source' && file.checksum === asset.sourceHash,
      );
      if (!source?.downloadUrl) {
        throw new Error(`资源当前源文件不可下载: ${asset.name}`);
      }
      return {
        assetId,
        name: asset.name,
        format: asset.format as ModelAssetFormat,
        url: source.downloadUrl,
      };
    },
  };
}

/** 正式运行时只认发布 Manifest，禁止回退到会被重新上传替换的模型库资源。 */
export function createPublicationAssetResolver(
  assets: PublicationManifest['assets'],
): AssetResolver {
  return {
    async resolve(assetId) {
      const asset = assets[assetId];
      if (!asset) throw new Error(`发布包未包含资源: ${assetId}`);
      return {
        assetId,
        name: asset.name,
        format: asset.format,
        url: asset.url,
      };
    },
  };
}
