import { createDefaultSceneDocument } from '@digital-twin/scene-schema';
import type { SceneSettings } from '@digital-twin/scene-schema';
import {
  ACESFilmicToneMapping,
  AgXToneMapping,
  BasicShadowMap,
  CineonToneMapping,
  Color,
  CustomToneMapping,
  EquirectangularReflectionMapping,
  Fog,
  FogExp2,
  LinearToneMapping,
  NeutralToneMapping,
  NoToneMapping,
  PCFShadowMap,
  PCFSoftShadowMap,
  ReinhardToneMapping,
  Scene,
  SRGBColorSpace,
  Texture,
  VSMShadowMap,
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

function settings(overrides: Partial<SceneSettings> = {}): SceneSettings {
  return {
    ...createDefaultSceneDocument('project-1', 'scene-1', '场景').settings,
    ...overrides,
  };
}

function rendererStub(): WebGLRenderer {
  return {
    toneMapping: NoToneMapping,
    toneMappingExposure: 1,
    shadowMap: { enabled: false, type: BasicShadowMap },
  } as WebGLRenderer;
}

describe('SceneSettingsSystem', () => {
  it('将全部 r183 tone mapping 和 shadow map 枚举映射到 Renderer', () => {
    const renderer = rendererStub();
    const system = new SceneSettingsSystem(new Scene(), renderer, {
      includeGrid: false,
    });
    const toneMappings = {
      custom: CustomToneMapping,
      none: NoToneMapping,
      linear: LinearToneMapping,
      reinhard: ReinhardToneMapping,
      cineon: CineonToneMapping,
      'aces-filmic': ACESFilmicToneMapping,
      agx: AgXToneMapping,
      neutral: NeutralToneMapping,
    } as const;
    const shadows = {
      basic: BasicShadowMap,
      pcf: PCFShadowMap,
      'pcf-soft': PCFSoftShadowMap,
      vsm: VSMShadowMap,
    } as const;

    for (const [toneMapping, expected] of Object.entries(toneMappings)) {
      system.apply(
        settings({ toneMapping: toneMapping as SceneSettings['toneMapping'] }),
      );
      expect(renderer.toneMapping, toneMapping).toBe(expected);
    }
    for (const [shadowMapType, expected] of Object.entries(shadows)) {
      system.apply(
        settings({
          shadowMapType: shadowMapType as SceneSettings['shadowMapType'],
          exposure: 2.4,
        }),
      );
      expect(renderer.shadowMap.type, shadowMapType).toBe(expected);
      expect(renderer.shadowMap.enabled).toBe(true);
      expect(renderer.toneMappingExposure).toBe(2.4);
    }
    system.dispose();
  });

  it('按源站语义应用无背景、颜色、Fog 和 FogExp2', () => {
    const scene = new Scene();
    const system = new SceneSettingsSystem(scene, rendererStub(), {
      includeGrid: false,
    });

    system.apply(settings({ backgroundType: 'none', fogType: 'none' }));
    expect((scene.background as Color).getHexString()).toBe('a0a0a0');
    expect(scene.fog).toBeNull();

    system.apply(
      settings({
        backgroundType: 'color',
        background: '#020617',
        fogType: 'linear',
        fogColor: '#123456',
        fogNear: 8,
        fogFar: 640,
      }),
    );
    expect((scene.background as Color).getHexString()).toBe('020617');
    expect(scene.fog).toBeInstanceOf(Fog);
    expect((scene.fog as Fog).color.getHexString()).toBe('123456');
    expect((scene.fog as Fog).near).toBe(8);
    expect((scene.fog as Fog).far).toBe(640);

    system.apply(
      settings({
        fogType: 'exponential',
        fogColor: '#334455',
        fogDensity: 0.025,
      }),
    );
    expect(scene.fog).toBeInstanceOf(FogExp2);
    expect((scene.fog as FogExp2).color.getHexString()).toBe('334455');
    expect((scene.fog as FogExp2).density).toBe(0.025);
    expect(scene.backgroundBlurriness).toBe(0);
    expect(scene.backgroundIntensity).toBe(5);
    system.dispose();
  });

  it('图片背景使用 sRGB 经纬映射并丢弃迟到纹理', async () => {
    const scene = new Scene();
    const firstLoad = deferred<Texture>();
    const secondLoad = deferred<Texture>();
    const firstTexture = new Texture();
    const secondTexture = new Texture();
    const firstDispose = vi.spyOn(firstTexture, 'dispose');
    const loader = {
      loadAsync: vi
        .fn()
        .mockReturnValueOnce(firstLoad.promise)
        .mockReturnValueOnce(secondLoad.promise),
    };
    const resolver: EnvironmentAssetResolver = {
      resolve: vi.fn(async (assetId: string) => ({
        assetId,
        name: `${assetId}.jpg`,
        format: 'jpg' as const,
        url: `http://example.com/${assetId}.jpg`,
      })),
    };
    const system = new SceneSettingsSystem(scene, rendererStub(), {
      includeGrid: false,
      textureLoader: loader,
    });

    const first = system.applyBackground(
      settings({ backgroundType: 'texture', backgroundAssetId: 'first' }),
      resolver,
    );
    await vi.waitFor(() => expect(loader.loadAsync).toHaveBeenCalledOnce());
    const second = system.applyBackground(
      settings({
        backgroundType: 'texture',
        backgroundAssetId: 'second',
        backgroundBlurriness: 0.4,
        backgroundIntensity: 3.2,
      }),
      resolver,
    );
    firstLoad.resolve(firstTexture);
    await first;
    expect(firstDispose).toHaveBeenCalledOnce();

    secondLoad.resolve(secondTexture);
    await second;
    expect(scene.background).toBe(secondTexture);
    expect(secondTexture.mapping).toBe(EquirectangularReflectionMapping);
    expect(secondTexture.colorSpace).toBe(SRGBColorSpace);
    expect(scene.backgroundBlurriness).toBe(0.4);
    expect(scene.backgroundIntensity).toBe(3.2);

    system.apply(settings({ backgroundType: 'color', background: '#111111' }));
    expect((scene.background as Color).getHexString()).toBe('111111');
    system.dispose();
  });

  it('环境开关、内置 Venice 与用户环境遵守所有权边界', async () => {
    const scene = new Scene();
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
    const system = new SceneSettingsSystem(scene, rendererStub(), {
      includeGrid: false,
      fallbackEnvironment,
      environmentLoader: { loadAsync: vi.fn(async () => sourceTexture) },
      environmentGenerator: generator,
    });

    await system.applyEnvironment(
      settings({ environmentEnabled: true, environmentAssetId: null }),
      resolver,
    );
    expect(scene.environment).toBe(fallbackEnvironment);
    expect(scene.environmentRotation.y).toBeCloseTo(Math.PI / 2);

    await system.applyEnvironment(
      settings({
        environmentEnabled: true,
        environmentAssetId: 'environment-1',
      }),
      resolver,
    );
    expect(scene.environment).toBe(userEnvironment);
    expect(sourceDispose).toHaveBeenCalledOnce();

    await system.applyEnvironment(
      settings({ environmentEnabled: false }),
      resolver,
    );
    expect(scene.environment).toBeNull();
    expect(userTarget.dispose).toHaveBeenCalledOnce();

    system.dispose();
    // fallback 由 Engine 持有，设置系统只解除引用。
    expect(fallbackDispose).not.toHaveBeenCalled();
    expect(generator.dispose).toHaveBeenCalledOnce();
  });
});
