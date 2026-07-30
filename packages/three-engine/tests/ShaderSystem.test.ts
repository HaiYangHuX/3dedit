import { Group, type ShaderMaterial } from 'three';
import { describe, expect, it } from 'vitest';
import { createShaderObject, ShaderSystem } from '../src/index.js';

describe('ShaderSystem', () => {
  it('按原站规则更新 uTime 和逐帧累加 iTime', () => {
    const warning = createShaderObject('CreateWarningShader');
    const radar = createShaderObject('CreateRadarShader');
    const root = new Group();
    root.add(warning, radar);
    const system = new ShaderSystem();
    system.sync([warning, radar]);

    expect(system.update(4.25)).toBe(true);
    expect((warning.material as ShaderMaterial).uniforms.uTime?.value).toBe(
      4.25,
    );
    expect((radar.material as ShaderMaterial).uniforms.iTime?.value).toBe(0.01);

    system.update(9);
    expect((warning.material as ShaderMaterial).uniforms.uTime?.value).toBe(9);
    expect((radar.material as ShaderMaterial).uniforms.iTime?.value).toBe(0.02);
  });

  it('警告光圈以 0.03 步进在 0.2 到 1.4 之间往返缩放', () => {
    const aperture = createShaderObject('CreateWarningApertureShader');
    const root = new Group();
    root.add(aperture);
    const system = new ShaderSystem();
    system.sync([aperture]);

    system.update(0);
    expect(aperture.scale.y).toBeCloseTo(0.23);
    for (let index = 0; index < 39; index += 1) system.update(index);
    expect(aperture.scale.y).toBeCloseTo(1.4);
    system.update(40);
    expect(aperture.scale.y).toBeCloseTo(1.37);
  });

  it('同步时剔除已移除对象，clear 后不再请求连续渲染', () => {
    const warning = createShaderObject('CreateWarningShader');
    const root = new Group();
    root.add(warning);
    const system = new ShaderSystem();
    system.sync([warning]);
    expect(system.size).toBe(1);

    warning.removeFromParent();
    expect(system.update(1)).toBe(false);
    expect(system.size).toBe(0);

    root.add(warning);
    system.sync([warning]);
    system.clear();
    expect(system.size).toBe(0);
    expect(system.update(2)).toBe(false);
  });
});
