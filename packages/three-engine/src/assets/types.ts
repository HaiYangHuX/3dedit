import type { AnimationClip, Object3D } from 'three';

export type ModelAssetFormat = 'glb' | 'gltf' | 'fbx' | 'obj' | 'stl' | 'usdz';

export interface AssetDescriptor {
  assetId: string;
  name: string;
  format: ModelAssetFormat;
  url: string;
}

export interface AssetResolver {
  resolve(assetId: string): Promise<AssetDescriptor>;
}

export interface LoadedAsset {
  root: Object3D;
  animations: AnimationClip[];
}

export interface AssetLoaderLike {
  load(descriptor: AssetDescriptor, signal?: AbortSignal): Promise<LoadedAsset>;
  dispose(): void;
}
