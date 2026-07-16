import {
  BoxGeometry,
  Group,
  Mesh,
  MeshStandardMaterial,
  type Object3D,
} from 'three';
import { describe, expect, it, vi } from 'vitest';
import {
  AssetInstanceSystem,
  StaleAssetLoadError,
  type AssetDescriptor,
  type AssetLoaderLike,
  type AssetResolver,
  type LoadedAsset,
} from '../src/index.js';

function model(): LoadedAsset {
  const root = new Group();
  root.add(new Mesh(new BoxGeometry(), new MeshStandardMaterial()));
  return { root, animations: [] };
}

const descriptor: AssetDescriptor = {
  assetId: 'asset-1',
  name: '水泵',
  format: 'glb',
  url: 'https://assets.test/pump.glb',
};

const resolver: AssetResolver = {
  resolve: vi.fn().mockResolvedValue(descriptor),
};

describe('AssetInstanceSystem', () => {
  it('同一资源只加载一次并克隆为两个独立业务实例', async () => {
    const template = model();
    const geometry = (template.root.children[0] as Mesh).geometry;
    const dispose = vi.spyOn(geometry, 'dispose');
    const loader: AssetLoaderLike = {
      load: vi.fn().mockResolvedValue(template),
      dispose: vi.fn(),
    };
    const system = new AssetInstanceSystem(resolver, loader);
    const generation = system.beginGeneration();

    const first = await system.instantiate('asset-1', generation);
    const second = await system.instantiate('asset-1', generation);

    expect(first).not.toBe(second);
    expect(first.children[0]).not.toBe(second.children[0]);
    expect((first.children[0] as Mesh).geometry).toBe(
      (second.children[0] as Mesh).geometry,
    );
    expect(loader.load).toHaveBeenCalledTimes(1);

    system.release(first);
    expect(dispose).not.toHaveBeenCalled();
    system.dispose();
    expect(dispose).toHaveBeenCalledTimes(1);
    expect(loader.dispose).toHaveBeenCalledTimes(1);
  });

  it('场景切换后释放迟到模板并拒绝加入新场景', async () => {
    let resolveLoad: ((value: LoadedAsset) => void) | undefined;
    const delayed = new Promise<LoadedAsset>((resolve) => {
      resolveLoad = resolve;
    });
    const lateTemplate = model();
    const geometry = (lateTemplate.root.children[0] as Mesh).geometry;
    const dispose = vi.spyOn(geometry, 'dispose');
    const loader: AssetLoaderLike = {
      load: vi.fn().mockReturnValue(delayed),
      dispose: vi.fn(),
    };
    const system = new AssetInstanceSystem(resolver, loader);
    const oldGeneration = system.beginGeneration();
    const pending = system.instantiate('asset-1', oldGeneration);

    system.beginGeneration();
    resolveLoad?.(lateTemplate);

    await expect(pending).rejects.toBeInstanceOf(StaleAssetLoadError);
    expect(dispose).toHaveBeenCalledTimes(1);
    system.dispose();
  });

  it('资源加载失败时返回带错误原因的可选占位节点', async () => {
    const loader: AssetLoaderLike = {
      load: vi.fn().mockRejectedValue(new Error('GLB 损坏')),
      dispose: vi.fn(),
    };
    const system = new AssetInstanceSystem(resolver, loader);
    const generation = system.beginGeneration();

    const placeholder: Object3D = await system.instantiate(
      'asset-1',
      generation,
    );

    expect(placeholder.userData.loadError).toContain('GLB 损坏');
    expect(placeholder.userData.assetId).toBe('asset-1');
    expect(placeholder.children.length).toBeGreaterThan(0);
    system.release(placeholder);
    system.dispose();
  });
});
