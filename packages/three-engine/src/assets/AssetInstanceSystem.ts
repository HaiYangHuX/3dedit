import type { Object3D } from 'three';
import { clone } from 'three/addons/utils/SkeletonUtils.js';
import { disposeObject3D } from '../ResourceTracker.js';
import { createAssetPlaceholder } from '../objects/createPlaceholder.js';
import { createNormalizedModelInstance } from './normalizeModelInstance.js';
import type { AssetLoaderLike, AssetResolver, LoadedAsset } from './types.js';

interface CacheEntry {
  generation: number;
  controller: AbortController;
  promise: Promise<LoadedAsset>;
  loaded?: LoadedAsset;
}

interface InstanceEntry {
  ownedResources: boolean;
  generation: number;
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
  // 重载期间旧代次的模板仍被可见实例共享，不能被新代次提前清理。
  private readonly cache = new Map<string, Map<number, CacheEntry>>();
  private readonly instances = new Map<Object3D, InstanceEntry>();

  constructor(
    private readonly resolver: AssetResolver,
    private readonly loader: AssetLoaderLike,
  ) {}

  beginGeneration(options: { preserveExisting?: boolean } = {}): number {
    this.generation += 1;
    if (options.preserveExisting) {
      // 旧实例继续渲染，新代次只中止旧的未完成请求。
      this.invalidatePendingGenerations();
    } else {
      this.clearGeneration();
    }
    return this.generation;
  }

  async instantiate(assetId: string, generation: number): Promise<Object3D> {
    this.assertCurrent(generation);
    try {
      const loaded = await this.getTemplate(assetId, generation);
      this.assertCurrent(generation);
      // 在线 数字孪生 会在每次拖入时按模型包围盒计算初始比例；克隆后再包装可保持共享 GPU 资源。
      const instance = createNormalizedModelInstance(clone(loaded.root));
      instance.userData.assetId = assetId;
      instance.userData.animations = loaded.animations.map((clip) =>
        clip.clone(),
      );
      this.instances.set(instance, { ownedResources: false, generation });
      return instance;
    } catch (error) {
      if (error instanceof StaleAssetLoadError) throw error;
      this.assertCurrent(generation);
      const message =
        error instanceof Error ? error.message : '未知模型加载错误';
      const placeholder = createAssetPlaceholder(assetId, message);
      this.instances.set(placeholder, { ownedResources: true, generation });
      return placeholder;
    }
  }

  release(root: Object3D): boolean {
    const entry = this.instances.get(root);
    if (!entry) return false;
    root.removeFromParent();
    if (entry.ownedResources) disposeObject3D(root);
    this.instances.delete(root);
    if (
      entry.generation !== this.generation &&
      !this.hasInstances(entry.generation)
    ) {
      this.disposeGenerationCache(entry.generation);
    }
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
    let entries = this.cache.get(assetId);
    const existing = entries?.get(generation);
    if (existing) return existing.promise;
    if (!entries) {
      entries = new Map<number, CacheEntry>();
      this.cache.set(assetId, entries);
    }

    const controller = new AbortController();
    const entry = {
      generation,
      controller,
      promise: Promise.resolve(undefined as never),
    } as CacheEntry;
    entry.promise = this.loadEntry(assetId, entry);
    entries.set(generation, entry);
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
        this.cache.get(assetId)?.get(entry.generation) !== entry
      ) {
        disposeObject3D(loaded.root);
        throw new StaleAssetLoadError();
      }
      entry.loaded = loaded;
      return loaded;
    } catch (error) {
      const entries = this.cache.get(assetId);
      if (entries?.get(entry.generation) === entry) {
        entries.delete(entry.generation);
        if (entries.size === 0) this.cache.delete(assetId);
      }
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
    this.disposeAllCaches();
  }

  /** 只中止旧代次的未完成加载，已完成模板由旧实例继续持有。 */
  private invalidatePendingGenerations(): void {
    for (const [assetId, entries] of this.cache) {
      for (const [generation, entry] of entries) {
        if (generation === this.generation || entry.loaded) continue;
        entry.controller.abort();
        entries.delete(generation);
      }
      if (entries.size === 0) this.cache.delete(assetId);
    }
  }

  private hasInstances(generation: number): boolean {
    for (const entry of this.instances.values()) {
      if (entry.generation === generation) return true;
    }
    return false;
  }

  private disposeGenerationCache(generation: number): void {
    for (const [assetId, entries] of this.cache) {
      const entry = entries.get(generation);
      if (!entry) continue;
      entry.controller.abort();
      if (entry.loaded) disposeObject3D(entry.loaded.root);
      entries.delete(generation);
      if (entries.size === 0) this.cache.delete(assetId);
    }
  }

  private disposeAllCaches(): void {
    for (const entries of this.cache.values()) {
      for (const entry of entries.values()) {
        entry.controller.abort();
        if (entry.loaded) disposeObject3D(entry.loaded.root);
      }
    }
    this.cache.clear();
  }

  private assertCurrent(generation: number): void {
    if (this.disposed || generation !== this.generation) {
      throw new StaleAssetLoadError();
    }
  }
}
