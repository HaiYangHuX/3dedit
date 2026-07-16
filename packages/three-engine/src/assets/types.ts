import type { AnimationClip, Object3D } from 'three';

export type ModelAssetFormat = 'glb' | 'gltf' | 'fbx' | 'obj' | 'stl' | 'usdz';
export type EngineAssetFormat = ModelAssetFormat | 'hdr';

export interface AssetDescriptor {
  assetId: string;
  name: string;
  format: EngineAssetFormat;
  url: string;
}

export interface AssetResolver {
  resolve(assetId: string): Promise<AssetDescriptor>;
}

/** 场景环境和模型共用资源解析入口，环境系统会额外要求 descriptor.format 为 hdr。 */
export type EnvironmentAssetResolver = AssetResolver;

export interface LoadedAsset {
  root: Object3D;
  animations: AnimationClip[];
}

export interface AssetLoaderLike {
  load(descriptor: AssetDescriptor, signal?: AbortSignal): Promise<LoadedAsset>;
  dispose(): void;
}
