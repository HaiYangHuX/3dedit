import {
  Box3,
  BoxGeometry,
  Group,
  Mesh,
  MeshStandardMaterial,
  Vector3,
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

function firstMesh(root: Object3D): Mesh {
  let result: Mesh | undefined;
  root.traverse((object) => {
    if (!result && object instanceof Mesh) result = object;
  });
  if (!result) throw new Error('测试模型缺少 Mesh');
  return result;
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
  it('按 数字孪生 4.0.4 在线源码把大型模型最大边归一为 1.5', async () => {
    const root = new Group();
    const mesh = new Mesh(
      // cj.glb 的实际包围盒约为 232.61 × 7.41 × 59.02，用同尺度保护本次回归。
      new BoxGeometry(232.61, 7.41, 59.02),
      new MeshStandardMaterial(),
    );
    root.add(mesh);
    const loader: AssetLoaderLike = {
      load: vi.fn().mockResolvedValue({ root, animations: [] }),
      dispose: vi.fn(),
    };
    const system = new AssetInstanceSystem(resolver, loader);
    const generation = system.beginGeneration();

    const instance = await system.instantiate('asset-1', generation);
    const size = new Box3().setFromObject(instance).getSize(new Vector3());

    expect(Math.max(size.x, size.y, size.z)).toBeCloseTo(1.5, 5);
    // 归一化属于模型内部导入变换，业务 SceneNode 的初始缩放仍应保持 1。
    expect(instance.scale.toArray()).toEqual([1, 1, 1]);
    expect(instance.children[0]?.userData.isNormalizedModelContent).toBe(true);
    instance.traverse((object) => {
      if (!(object instanceof Mesh)) return;
      expect(object.castShadow).toBe(true);
      expect(object.receiveShadow).toBe(true);
    });

    system.dispose();
  });

  it('归一化后立即刷新 GLTF 内部带平移节点的 world matrix', async () => {
    const root = new Group();
    const translated = new Group();
    translated.position.x = 100;
    translated.add(
      new Mesh(new BoxGeometry(200, 2, 2), new MeshStandardMaterial()),
    );
    root.add(translated);
    const loader: AssetLoaderLike = {
      load: vi.fn().mockResolvedValue({ root, animations: [] }),
      dispose: vi.fn(),
    };
    const system = new AssetInstanceSystem(resolver, loader);
    const generation = system.beginGeneration();

    const instance = await system.instantiate('asset-1', generation);
    const nestedMesh = firstMesh(instance);
    nestedMesh.updateWorldMatrix(true, false);

    // 最大边为 200，因此内部节点的 100 单位平移也必须按归一化比例缩放。
    expect(nestedMesh.getWorldPosition(new Vector3()).x).toBeCloseTo(
      100 * (1.5 / 200),
      5,
    );
    system.dispose();
  });

  it('保留源站小模型分母规则且空包围盒不会产生 Infinity 或 NaN', async () => {
    const smallRoot = new Group();
    smallRoot.add(
      new Mesh(new BoxGeometry(0.4, 0.2, 0.1), new MeshStandardMaterial()),
    );
    const emptyRoot = new Group();
    const loader: AssetLoaderLike = {
      load: vi
        .fn()
        .mockResolvedValueOnce({ root: smallRoot, animations: [] })
        .mockResolvedValueOnce({ root: emptyRoot, animations: [] }),
      dispose: vi.fn(),
    };
    const multiResolver: AssetResolver = {
      resolve: vi.fn(async (assetId) => ({ ...descriptor, assetId })),
    };
    const system = new AssetInstanceSystem(multiResolver, loader);
    const generation = system.beginGeneration();

    const small = await system.instantiate('small', generation);
    const empty = await system.instantiate('empty', generation);
    const smallSize = new Box3().setFromObject(small).getSize(new Vector3());

    // 在线 bundle 使用 1.5 / 0.5，而不是把不足 1 的模型强制拉满到 1.5。
    expect(Math.max(smallSize.x, smallSize.y, smallSize.z)).toBeCloseTo(1.2, 5);
    expect(
      empty.children[0]?.scale
        .toArray()
        .every((value) => Number.isFinite(value)),
    ).toBe(true);
    expect(empty.children[0]?.scale.toArray()).toEqual([3, 3, 3]);

    system.dispose();
  });

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
    const firstMeshInstance = firstMesh(first);
    const secondMeshInstance = firstMesh(second);

    expect(first).not.toBe(second);
    expect(first.children[0]).not.toBe(second.children[0]);
    expect(firstMeshInstance).not.toBe(secondMeshInstance);
    expect(firstMeshInstance.geometry).toBe(secondMeshInstance.geometry);
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

  it('保留旧代次实例直到新场景提交，避免重载期间模型消失', async () => {
    const loader: AssetLoaderLike = {
      load: vi.fn().mockResolvedValue(model()),
      dispose: vi.fn(),
    };
    const system = new AssetInstanceSystem(resolver, loader);
    const oldGeneration = system.beginGeneration();
    const oldInstance = await system.instantiate('asset-1', oldGeneration);

    const nextGeneration = system.beginGeneration({ preserveExisting: true });
    expect(system.release(oldInstance)).toBe(true);
    const nextInstance = await system.instantiate('asset-1', nextGeneration);

    expect(nextInstance).not.toBe(oldInstance);
    system.release(nextInstance);
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
