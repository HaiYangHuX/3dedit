import type {
  AssetResolver,
  ModelAssetFormat,
  TextureAssetFormat,
} from '@digital-twin/three-engine';
import { assetApi } from '../api/assets';

const modelFormats = new Set<ModelAssetFormat>([
  'glb',
  'gltf',
  'fbx',
  'obj',
  'stl',
  'usdz',
]);
const textureFormats = new Set<TextureAssetFormat>([
  'png',
  'jpg',
  'jpeg',
  'webp',
]);

function isModelFormat(value: string): value is ModelAssetFormat {
  return modelFormats.has(value as ModelAssetFormat);
}

function isTextureFormat(value: string): value is TextureAssetFormat {
  return textureFormats.has(value as TextureAssetFormat);
}

/**
 * 将模型库详情转成 Three Loader 所需的稳定描述。
 * Asset 可保留旧源文件记录，因此必须同时匹配 role 和 sourceHash。
 */
export const editorAssetResolver: AssetResolver = {
  async resolve(assetId) {
    const asset = await assetApi.get(assetId);
    if (asset.status !== 'ready') {
      throw new Error(`资源尚未处理完成: ${asset.name}`);
    }
    const isModel = asset.kind === 'model' && isModelFormat(asset.format);
    const isEnvironment =
      asset.kind === 'environment' && asset.format === 'hdr';
    const isTexture =
      (asset.kind === 'image' || asset.kind === 'texture') &&
      isTextureFormat(asset.format);
    if (!isModel && !isEnvironment && !isTexture) {
      throw new Error(`资源不是可加载的模型、环境或贴图: ${asset.name}`);
    }
    const source = asset.files.find(
      (file) => file.role === 'source' && file.checksum === asset.sourceHash,
    );
    if (!source?.downloadUrl) {
      throw new Error(`资源当前源文件不可下载: ${asset.name}`);
    }
    return {
      assetId: asset.id,
      name: asset.name,
      format: isEnvironment
        ? 'hdr'
        : (asset.format as ModelAssetFormat | TextureAssetFormat),
      url: source.downloadUrl,
    };
  },
};
