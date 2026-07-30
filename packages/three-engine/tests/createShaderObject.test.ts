import {
  AdditiveBlending,
  CylinderGeometry,
  DoubleSide,
  Mesh,
  NormalBlending,
  PlaneGeometry,
  ShaderMaterial,
} from 'three';
import { describe, expect, it } from 'vitest';
import { createShaderObject, type ShaderMethod } from '../src/index.js';

interface ShaderExpectation {
  method: ShaderMethod;
  geometry: 'plane' | 'cylinder' | 'fence';
  size: [number, number] | [number, number, number];
  rotationX: number;
  renderOrder: number;
  timeUniform: 'uTime' | 'iTime' | 'scale';
}

const cases: ShaderExpectation[] = [
  {
    method: 'CreateWarningShader',
    geometry: 'plane',
    size: [2, 2],
    rotationX: Math.PI / 2,
    renderOrder: -1000,
    timeUniform: 'uTime',
  },
  {
    method: 'CreateCompassShader',
    geometry: 'plane',
    size: [4, 4],
    rotationX: Math.PI / 2,
    renderOrder: -1000,
    timeUniform: 'iTime',
  },
  {
    method: 'CreateRadarShader',
    geometry: 'plane',
    size: [3, 3],
    rotationX: Math.PI / 2,
    renderOrder: -1000,
    timeUniform: 'iTime',
  },
  {
    method: 'CreateWallShader',
    geometry: 'plane',
    size: [3, 1],
    rotationX: 0,
    renderOrder: -1000,
    timeUniform: 'uTime',
  },
  {
    method: 'CreateApertureShader',
    geometry: 'plane',
    size: [3, 3],
    rotationX: Math.PI / 2,
    renderOrder: -1000,
    timeUniform: 'uTime',
  },
  {
    method: 'CreateFlickerWarning',
    geometry: 'plane',
    size: [1.2, 1.2],
    rotationX: -Math.PI / 2,
    renderOrder: 0,
    timeUniform: 'uTime',
  },
  {
    method: 'CreateWarningApertureShader',
    geometry: 'cylinder',
    size: [0.7, 0.7, 1.5],
    rotationX: 0,
    renderOrder: 0,
    timeUniform: 'scale',
  },
  {
    method: 'CreateElectronicFence',
    geometry: 'fence',
    size: [1.5, 1.5, 1.5],
    rotationX: 0,
    renderOrder: 0,
    timeUniform: 'uTime',
  },
  {
    method: 'CreateWarningGuardrail',
    geometry: 'fence',
    size: [1.5, 1.5, 1.5],
    rotationX: 0,
    renderOrder: 0,
    timeUniform: 'uTime',
  },
  {
    method: 'CreateWarningGuardrailBreath',
    geometry: 'fence',
    size: [1.5, 1.5, 1.5],
    rotationX: 0,
    renderOrder: 0,
    timeUniform: 'uTime',
  },
  {
    method: 'CreateLogisticsConveyor',
    geometry: 'plane',
    size: [1.2, 12],
    rotationX: -Math.PI / 2,
    renderOrder: 0,
    timeUniform: 'uTime',
  },
  {
    method: 'CreateHologramBeam',
    geometry: 'cylinder',
    size: [0.55, 0.72, 3.2],
    rotationX: 0,
    renderOrder: 0,
    timeUniform: 'uTime',
  },
  {
    method: 'CreateHexTechPlatform',
    geometry: 'plane',
    size: [3.2, 3.2],
    rotationX: -Math.PI / 2,
    renderOrder: 0,
    timeUniform: 'uTime',
  },
];

describe('createShaderObject', () => {
  it.each(cases)('$method 复现原站几何、朝向和材质标记', (item) => {
    const mesh = createShaderObject(item.method);

    expect(mesh).toBeInstanceOf(Mesh);
    expect(mesh.rotation.x).toBeCloseTo(item.rotationX);
    expect(mesh.renderOrder).toBe(item.renderOrder);
    expect(mesh.userData.shaderMethod).toBe(item.method);
    const material = mesh.material as ShaderMaterial;
    expect(material).toBeInstanceOf(ShaderMaterial);
    expect(material.side).toBe(DoubleSide);
    expect(material.transparent).toBe(true);
    expect(material.depthWrite).toBe(false);
    expect(material.depthTest).toBe(true);
    expect(material.vertexShader).toContain('gl_Position');
    expect(material.fragmentShader).toContain('gl_FragColor');
    if (item.timeUniform !== 'scale') {
      expect(material.uniforms[item.timeUniform]).toBeDefined();
    }

    if (item.geometry === 'plane') {
      expect(mesh.geometry).toBeInstanceOf(PlaneGeometry);
      const parameters = (mesh.geometry as PlaneGeometry).parameters;
      expect([parameters.width, parameters.height]).toEqual(item.size);
    } else if (item.geometry === 'cylinder') {
      expect(mesh.geometry).toBeInstanceOf(CylinderGeometry);
      const parameters = (mesh.geometry as CylinderGeometry).parameters;
      expect([
        parameters.radiusTop,
        parameters.radiusBottom,
        parameters.height,
      ]).toEqual(item.size);
      mesh.geometry.computeBoundingBox();
      expect(mesh.geometry.boundingBox?.min.y).toBeCloseTo(0);
      expect(mesh.geometry.boundingBox?.max.y).toBeCloseTo(parameters.height);
    } else {
      mesh.geometry.computeBoundingBox();
      const box = mesh.geometry.boundingBox!;
      expect(box.max.x - box.min.x).toBeCloseTo(item.size[0]);
      expect(box.max.z - box.min.z).toBeCloseTo(item.size[1]);
      expect(box.max.y - box.min.y).toBeCloseTo(item.size[2]!);
    }
  });

  it('全息能量光柱单独使用原站 AdditiveBlending', () => {
    const hologram = createShaderObject('CreateHologramBeam');
    const warning = createShaderObject('CreateWarningShader');

    expect((hologram.material as ShaderMaterial).blending).toBe(
      AdditiveBlending,
    );
    expect((warning.material as ShaderMaterial).blending).toBe(NormalBlending);
  });

  it('关键默认 uniform 与生产包保持一致', () => {
    const warning = createShaderObject('CreateWarningShader')
      .material as ShaderMaterial;
    expect(warning.uniforms.uIntensity?.value).toBe(1);
    expect(warning.uniforms.uSpeed?.value).toBe(1);
    expect(warning.uniforms.uRadius?.value).toBe(0.5);

    const conveyor = createShaderObject('CreateLogisticsConveyor')
      .material as ShaderMaterial;
    expect(conveyor.uniforms.uSpeed?.value).toBe(1.5);
    expect(conveyor.uniforms.uColor?.value.getHexString()).toBe('00aaff');
  });
});
