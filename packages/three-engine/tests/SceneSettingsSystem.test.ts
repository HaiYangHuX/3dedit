import { Scene, type Color, type WebGLRenderer } from 'three';
import { describe, expect, it, vi } from 'vitest';
import { SceneSettingsSystem } from '../src/index.js';

describe('SceneSettingsSystem', () => {
  it('同步背景、曝光和网格并释放辅助几何资源', () => {
    const scene = new Scene();
    const renderer = { toneMappingExposure: 1 } as WebGLRenderer;
    const system = new SceneSettingsSystem(scene, renderer);
    const geometryDispose = vi.spyOn(system.grid.geometry, 'dispose');

    system.apply({
      background: '#020617',
      exposure: 1.6,
      gridVisible: false,
      environmentAssetId: null,
    });

    expect((scene.background as Color).getHexString()).toBe('020617');
    expect(renderer.toneMappingExposure).toBe(1.6);
    expect(system.grid.visible).toBe(false);

    system.dispose();
    expect(system.grid.parent).toBeNull();
    expect(geometryDispose).toHaveBeenCalledOnce();
  });
});
