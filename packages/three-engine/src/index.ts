export {
  AssetInstanceSystem,
  StaleAssetLoadError,
} from './assets/AssetInstanceSystem';
export { AssetLoader, type AssetLoaderOptions } from './assets/AssetLoader';
export type {
  AssetDescriptor,
  AssetLoaderLike,
  AssetResolver,
  LoadedAsset,
  ModelAssetFormat,
} from './assets/types';
export { SceneDocumentSystem } from './documents/SceneDocumentSystem';
export { EditorEngine } from './EditorEngine';
export { disposeObject3D, ResourceTracker } from './ResourceTracker';
export type { AssetInstanceProvider, LoadReport, SceneStats } from './types';
