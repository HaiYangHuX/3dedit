import type { Object3D } from 'three';
import { clone } from 'three/addons/utils/SkeletonUtils.js';
import { disposeObject3D } from '../ResourceTracker.js';
import { createAssetPlaceholder } from '../objects/createPlaceholder.js';
import type { AssetLoaderLike, AssetResolver, LoadedAsset } from './types.js';

interface CacheEntry {
  generation: number;
  controller: AbortController;
  promise: Promise<LoadedAsset>;
  loaded?: LoadedAsset;
}

interface InstanceEntry {
  ownedResources: boolean;
}

export class StaleAssetLoadError extends Error {
  constructor() {
    super('模型加载结果已过期');
    this.name = 'StaleAssetLoadError';
  }
}

/** 模板按 assetId 缓存，业务实例共享 GPU 资源但拥有独立 Object3D/骨骼层级。 */
export class AssetInstanceSystem {
  private generation = 0;
  private disposed = false;
  private readonly cache = new Map<string, CacheEntry>();
  private readonly instances = new Map<Object3D, InstanceEntry>();

  constructor(
    private readonly resolver: AssetResolver,
    private readonly loader: AssetLoaderLike,
  ) {}

  beginGeneration(): number {
    this.generation += 1;
    this.clearGeneration();
    return this.generation;
  }

  async instantiate(assetId: string, generation: number): Promise<Object3D> {
    this.assertCurrent(generation);
    try {
      const loaded = await this.getTemplate(assetId, generation);
      this.assertCurrent(generation);
      const instance = clone(loaded.root);
      instance.userData.assetId = assetId;
      instance.userData.animations = loaded.animations.map((clip) =>
        clip.clone(),
      );
      this.instances.set(instance, { ownedResources: false });
      return instance;
    } catch (error) {
      if (error instanceof StaleAssetLoadError) throw error;
      this.assertCurrent(generation);
      const message =
        error instanceof Error ? error.message : '未知模型加载错误';
      const placeholder = createAssetPlaceholder(assetId, message);
      this.instances.set(placeholder, { ownedResources: true });
      return placeholder;
    }
  }

  release(root: Object3D): boolean {
    const entry = this.instances.get(root);
    if (!entry) return false;
    root.removeFromParent();
    if (entry.ownedResources) disposeObject3D(root);
    this.instances.delete(root);
    return true;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.generation += 1;
    this.clearGeneration();
    this.loader.dispose();
  }

  private async getTemplate(
    assetId: string,
    generation: number,
  ): Promise<LoadedAsset> {
    const existing = this.cache.get(assetId);
    if (existing?.generation === generation) return existing.promise;

    const controller = new AbortController();
    const entry = {
      generation,
      controller,
      promise: Promise.resolve(undefined as never),
    } as CacheEntry;
    entry.promise = this.loadEntry(assetId, entry);
    this.cache.set(assetId, entry);
    return entry.promise;
  }

  private async loadEntry(
    assetId: string,
    entry: CacheEntry,
  ): Promise<LoadedAsset> {
    try {
      const descriptor = await this.resolver.resolve(assetId);
      const loaded = await this.loader.load(
        descriptor,
        entry.controller.signal,
      );
      if (
        this.disposed ||
        entry.generation !== this.generation ||
        this.cache.get(assetId) !== entry
      ) {
        disposeObject3D(loaded.root);
        throw new StaleAssetLoadError();
      }
      entry.loaded = loaded;
      return loaded;
    } catch (error) {
      if (this.cache.get(assetId) === entry) this.cache.delete(assetId);
      if (
        error instanceof StaleAssetLoadError ||
        this.disposed ||
        entry.generation !== this.generation
      ) {
        throw new StaleAssetLoadError();
      }
      throw error;
    }
  }

  private clearGeneration(): void {
    for (const root of [...this.instances.keys()]) this.release(root);
    for (const entry of this.cache.values()) {
      entry.controller.abort();
      if (entry.loaded) disposeObject3D(entry.loaded.root);
    }
    this.cache.clear();
  }

  private assertCurrent(generation: number): void {
    if (this.disposed || generation !== this.generation) {
      throw new StaleAssetLoadError();
    }
  }
}
