import {
  BoxGeometry,
  Group,
  Mesh,
  MeshBasicMaterial,
  Object3D,
  Vector3,
} from 'three';
import { describe, expect, it, vi } from 'vitest';
import {
  configureOrbitControls,
  updateOrbitControlsDistanceLimit,
  type OrbitControlsLike,
} from '../src/interaction/OrbitControlsProfile';

function createControls(): OrbitControlsLike {
  return {
    enablePan: false,
    enableDamping: false,
    dampingFactor: 0,
    target: new Vector3(3, 2, 1),
    object: new Object3D(),
    maxDistance: Number.POSITIVE_INFINITY,
    update: vi.fn(),
  };
}

describe('OrbitControls 源站交互配置', () => {
  it('按核心编辑器与运行时策略启用阻尼并固定原点观察中心', () => {
    const editorControls = createControls();
    configureOrbitControls(editorControls, { enablePan: false });

    expect(editorControls.enablePan).toBe(false);
    expect(editorControls.enableDamping).toBe(true);
    expect(editorControls.dampingFactor).toBe(0.05);
    expect(editorControls.target.toArray()).toEqual([0, 0, 0]);
    expect(editorControls.update).toHaveBeenCalledTimes(1);

    const runtimeControls = createControls();
    configureOrbitControls(runtimeControls, { enablePan: false });
    expect(runtimeControls.enablePan).toBe(false);
    expect(runtimeControls.enableDamping).toBe(true);
  });

  it('按业务根包围盒对角线的十倍限制滚轮拉远距离', () => {
    const controls = createControls();
    controls.object.position.set(0, 0, 10);
    const root = new Group();
    root.add(new Mesh(new BoxGeometry(2, 4, 6), new MeshBasicMaterial()));

    const maxDistance = updateOrbitControlsDistanceLimit(controls, root);

    expect(maxDistance).toBeCloseTo(Math.sqrt(56) * 10);
    expect(controls.maxDistance).toBeCloseTo(Math.sqrt(56) * 10);
  });

  it('空场景不重置已有滚轮上限，避免初始化时相机突然跳变', () => {
    const controls = createControls();
    controls.maxDistance = 120;
    const root = new Group();

    expect(updateOrbitControlsDistanceLimit(controls, root)).toBe(120);
    expect(controls.maxDistance).toBe(120);
  });
});
