import { createDefaultSceneDocument } from '@digital-twin/scene-schema';
import type { SceneSettings } from '@digital-twin/scene-schema';
import {
  AdditiveBlending,
  Scene,
  Texture,
  type BufferAttribute,
  type Points,
  type PointsMaterial,
} from 'three';
import { describe, expect, it, vi } from 'vitest';
import { WeatherSystem } from '../src/index.js';

function settings(overrides: Partial<SceneSettings>): SceneSettings {
  return {
    ...createDefaultSceneDocument('project-1', 'scene-1', '场景').settings,
    ...overrides,
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

describe('WeatherSystem', () => {
  it('按源站参数创建雨粒子并用 Engine delta 驱动', async () => {
    const scene = new Scene();
    const requestFrame = vi.fn();
    vi.stubGlobal('requestAnimationFrame', requestFrame);
    const system = new WeatherSystem(scene, {
      textureLoader: { loadAsync: vi.fn(async () => new Texture()) },
      random: () => 0.5,
    });

    await system.apply(
      settings({
        weatherType: 'rain',
        weatherCount: 3,
        weatherSpeed: 0.4,
        weatherOpacity: 0.6,
        weatherSize: 0.5,
        weatherArea: 100,
        weatherHeight: 50,
      }),
    );
    const points = scene.children[0] as Points;
    const material = points.material as PointsMaterial;
    const positions = points.geometry.getAttribute(
      'position',
    ) as BufferAttribute;
    expect(points.userData.type).toBe('weather');
    expect(positions.count).toBe(3);
    expect(material).toMatchObject({
      size: 0.5,
      opacity: 0.6,
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending,
      alphaTest: 0.01,
      sizeAttenuation: true,
      vertexColors: true,
    });

    const before = positions.getY(0);
    system.update(1 / 60, 10);
    expect(positions.getY(0)).toBeCloseTo(before - 0.4);
    expect(points.rotation.z).toBeCloseTo(Math.atan2(0.05, 0.4));
    expect(points.rotation.x).toBeCloseTo(-Math.atan2(0.02, 0.4));
    expect(requestFrame).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
    system.dispose();
  });

  it('雪花使用双正弦横向漂移并在上下边界渐隐', async () => {
    const scene = new Scene();
    const system = new WeatherSystem(scene, {
      textureLoader: { loadAsync: vi.fn(async () => new Texture()) },
      random: () => 0.5,
    });
    await system.apply(
      settings({
        weatherType: 'snow',
        weatherCount: 2,
        weatherHeight: 50,
      }),
    );
    const points = scene.children[0] as Points;
    const positions = points.geometry.getAttribute(
      'position',
    ) as BufferAttribute;
    const colors = points.geometry.getAttribute('color') as BufferAttribute;
    positions.setY(0, 0.5);

    system.update(1 / 60, 12);

    expect(positions.getX(0)).not.toBe(0);
    expect(positions.getZ(0)).not.toBe(0);
    expect(colors.getX(0)).toBeGreaterThanOrEqual(0);
    expect(colors.getX(0)).toBeLessThan(0.1);
    expect(points.rotation.toArray().slice(0, 3)).toEqual([0, 0, 0]);
    system.dispose();
  });

  it('切换为无天气时立即清空并释放 GPU 资源', async () => {
    const scene = new Scene();
    const texture = new Texture();
    const textureDispose = vi.spyOn(texture, 'dispose');
    const system = new WeatherSystem(scene, {
      textureLoader: { loadAsync: vi.fn(async () => texture) },
    });
    await system.apply(settings({ weatherType: 'rain', weatherCount: 10 }));
    const points = scene.children[0] as Points;
    const geometryDispose = vi.spyOn(points.geometry, 'dispose');
    const materialDispose = vi.spyOn(
      points.material as PointsMaterial,
      'dispose',
    );

    await system.apply(settings({ weatherType: 'none' }));

    expect(scene.children).toHaveLength(0);
    expect(geometryDispose).toHaveBeenCalledOnce();
    expect(materialDispose).toHaveBeenCalledOnce();
    expect(textureDispose).toHaveBeenCalledOnce();
    system.dispose();
  });

  it('丢弃在无天气设置之后才到达的精灵纹理', async () => {
    const scene = new Scene();
    const loading = deferred<Texture>();
    const texture = new Texture();
    const dispose = vi.spyOn(texture, 'dispose');
    const system = new WeatherSystem(scene, {
      textureLoader: { loadAsync: vi.fn(() => loading.promise) },
    });

    const rain = system.apply(settings({ weatherType: 'rain' }));
    await system.apply(settings({ weatherType: 'none' }));
    loading.resolve(texture);
    await rain;

    expect(scene.children).toHaveLength(0);
    expect(dispose).toHaveBeenCalledOnce();
    system.dispose();
  });
});
