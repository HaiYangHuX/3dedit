import {
  FogExp2,
  GridHelper,
  Group,
  Scene,
  Texture,
  type Color,
  type Material,
  type WebGLRenderer,
} from 'three';
import { describe, expect, it, vi } from 'vitest';
import {
  SceneSettingsSystem,
  type EnvironmentAssetResolver,
} from '../src/index.js';

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

describe('SceneSettingsSystem', () => {
  it('按线上 r183 参数同步背景、曝光、编辑雾和双层网格', () => {
    const scene = new Scene();
    const renderer = { toneMappingExposure: 1 } as WebGLRenderer;
    const system = new SceneSettingsSystem(scene, renderer);
    const gridGroup = system.grid as Group;
    const grids = gridGroup.children as GridHelper[];

    expect(gridGroup).toBeInstanceOf(Group);
    expect(grids).toHaveLength(2);
    expect(grids.every((grid) => grid instanceof GridHelper)).toBe(true);
    // GridHelper 每个分段产生纵横各一条线，每条线包含两个顶点。
    expect(grids[0]!.geometry.getAttribute('position').count).toBe(8_004);
    expect(grids[1]!.geometry.getAttribute('position').count).toBe(804);
    expect((grids[0]!.material as Material & { opacity: number }).opacity).toBe(
      0.1,
    );
    expect((grids[1]!.material as Material & { opacity: number }).opacity).toBe(
      0.3,
    );
    const geometryDisposes = grids.map((grid) =>
      vi.spyOn(grid.geometry, 'dispose'),
    );
    const materialDisposes = grids.flatMap((grid) => {
      const materials = Array.isArray(grid.material)
        ? grid.material
        : [grid.material];
      return materials.map((material) => vi.spyOn(material, 'dispose'));
    });

    system.apply({
      background: '#020617',
      exposure: 1.6,
      gridVisible: false,
      environmentAssetId: null,
    });

    expect((scene.background as Color).getHexString()).toBe('020617');
    expect(renderer.toneMappingExposure).toBe(1.6);
    expect(gridGroup.visible).toBe(false);
    expect(scene.fog).toBeInstanceOf(FogExp2);
    expect((scene.fog as FogExp2).color.getHexString()).toBe('020617');
    expect((scene.fog as FogExp2).density).toBe(0.01);

    system.dispose();
    expect(gridGroup.parent).toBeNull();
    for (const dispose of geometryDisposes)
      expect(dispose).toHaveBeenCalledOnce();
    for (const dispose of materialDisposes)
      expect(dispose).toHaveBeenCalledOnce();
  });

  it('纯运行时模式不创建或挂载编辑网格', () => {
    const scene = new Scene();
    const renderer = { toneMappingExposure: 1 } as WebGLRenderer;
    const system = new SceneSettingsSystem(scene, renderer, {
      includeGrid: false,
    });

    expect(system.grid).toBeUndefined();
    expect(scene.children).toHaveLength(0);
    expect(scene.fog).toBeNull();
    system.dispose();
  });

  it('没有用户 HDR 时使用 fallback environment，清除 HDR 后恢复', async () => {
    const scene = new Scene();
    const renderer = { toneMappingExposure: 1 } as WebGLRenderer;
    const fallbackEnvironment = new Texture();
    const fallbackDispose = vi.spyOn(fallbackEnvironment, 'dispose');
    const userEnvironment = new Texture();
    const userTarget = { texture: userEnvironment, dispose: vi.fn() };
    const generator = {
      fromEquirectangular: vi.fn(() => userTarget),
      dispose: vi.fn(),
    };
    const sourceTexture = new Texture();
    const sourceDispose = vi.spyOn(sourceTexture, 'dispose');
    const resolver: EnvironmentAssetResolver = {
      resolve: vi.fn(async (assetId: string) => ({
        assetId,
        name: assetId,
        format: 'hdr' as const,
        url: `http://example.com/${assetId}.hdr`,
      })),
    };
    const system = new SceneSettingsSystem(scene, renderer, {
      includeGrid: false,
      fallbackEnvironment,
      environmentLoader: { loadAsync: vi.fn(async () => sourceTexture) },
      environmentGenerator: generator,
    });

    await system.applyEnvironment(null, resolver);
    expect(scene.environment).toBe(fallbackEnvironment);

    await system.applyEnvironment('environment-1', resolver);
    expect(scene.environment).toBe(userEnvironment);
    expect(sourceDispose).toHaveBeenCalledOnce();

    await system.applyEnvironment(null, resolver);
    expect(scene.environment).toBe(fallbackEnvironment);
    expect(userTarget.dispose).toHaveBeenCalledOnce();

    system.dispose();
    expect(scene.environment).toBeNull();
    // fallback 由 EditorEngine 持有，设置系统只能解除引用，不能越权释放。
    expect(fallbackDispose).not.toHaveBeenCalled();
    expect(generator.dispose).toHaveBeenCalledOnce();
  });

  it('连续切换 HDR 时丢弃迟到纹理并只保留最新 PMREM', async () => {
    const scene = new Scene();
    const renderer = { toneMappingExposure: 1 } as WebGLRenderer;
    const firstLoad = deferred<Texture>();
    const secondLoad = deferred<Texture>();
    const firstTexture = new Texture();
    const secondTexture = new Texture();
    const firstDispose = vi.spyOn(firstTexture, 'dispose');
    const secondDispose = vi.spyOn(secondTexture, 'dispose');
    const environmentTexture = new Texture();
    const target = { texture: environmentTexture, dispose: vi.fn() };
    const generator = {
      fromEquirectangular: vi.fn(() => target),
      dispose: vi.fn(),
    };
    const loader = {
      loadAsync: vi
        .fn()
        .mockReturnValueOnce(firstLoad.promise)
        .mockReturnValueOnce(secondLoad.promise),
    };
    const resolver: EnvironmentAssetResolver = {
      resolve: vi.fn(async (assetId: string) => ({
        assetId,
        name: assetId,
        format: 'hdr' as const,
        url: `http://example.com/${assetId}.hdr`,
      })),
    };
    const system = new SceneSettingsSystem(scene, renderer, {
      includeGrid: false,
      environmentLoader: loader,
      environmentGenerator: generator,
    });

    const first = system.applyEnvironment('environment-1', resolver);
    await vi.waitFor(() => expect(loader.loadAsync).toHaveBeenCalledTimes(1));
    const second = system.applyEnvironment('environment-2', resolver);
    firstLoad.resolve(firstTexture);
    await first;
    expect(firstDispose).toHaveBeenCalledOnce();
    expect(generator.fromEquirectangular).not.toHaveBeenCalled();

    secondLoad.resolve(secondTexture);
    await second;
    expect(secondDispose).toHaveBeenCalledOnce();
    expect(scene.environment).toBe(environmentTexture);

    await system.applyEnvironment(null, resolver);
    expect(scene.environment).toBeNull();
    expect(target.dispose).toHaveBeenCalledOnce();
    system.dispose();
  });
});
