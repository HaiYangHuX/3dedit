import { Scene, Texture, type Color, type WebGLRenderer } from 'three';
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
  it('同步背景、曝光和网格并释放辅助几何资源', () => {
    const scene = new Scene();
    const renderer = { toneMappingExposure: 1 } as WebGLRenderer;
    const system = new SceneSettingsSystem(scene, renderer);
    const geometryDispose = vi.spyOn(system.grid!.geometry, 'dispose');

    system.apply({
      background: '#020617',
      exposure: 1.6,
      gridVisible: false,
      environmentAssetId: null,
    });

    expect((scene.background as Color).getHexString()).toBe('020617');
    expect(renderer.toneMappingExposure).toBe(1.6);
    expect(system.grid!.visible).toBe(false);

    system.dispose();
    expect(system.grid!.parent).toBeNull();
    expect(geometryDispose).toHaveBeenCalledOnce();
  });

  it('纯运行时模式不创建或挂载编辑网格', () => {
    const scene = new Scene();
    const renderer = { toneMappingExposure: 1 } as WebGLRenderer;
    const system = new SceneSettingsSystem(scene, renderer, {
      includeGrid: false,
    });

    expect(system.grid).toBeUndefined();
    expect(scene.children).toHaveLength(0);
    system.dispose();
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
