import { PerspectiveCamera, Vector3 } from 'three';
import { describe, expect, it, vi } from 'vitest';
import {
  ViewportCameraSystem,
  type CameraControlsTarget,
  type CameraView,
} from '../src/interaction/ViewportCameraSystem.js';

function createFixture() {
  const camera = new PerspectiveCamera(50, 1, 0.01, 1_000);
  camera.position.set(5, 3, 8);
  const target = new Vector3(0, 0.5, 0);
  const controls: CameraControlsTarget = {
    target,
    update: vi.fn(() => camera.lookAt(target)),
  };
  const system = new ViewportCameraSystem(camera, controls, {
    durationSeconds: 0.2,
  });
  controls.update();
  return { camera, controls, system };
}

describe('ViewportCameraSystem', () => {
  it('保持观察中心和距离切换六个正交方向', () => {
    const directions: Record<CameraView, [number, number, number]> = {
      front: [0, 0, 1],
      back: [0, 0, -1],
      left: [-1, 0, 0],
      right: [1, 0, 0],
      top: [0, 1, 0],
      bottom: [0, -1, 0],
    };
    for (const [view, expected] of Object.entries(directions) as Array<
      [CameraView, [number, number, number]]
    >) {
      const { camera, controls, system } = createFixture();
      const distance = camera.position.distanceTo(controls.target);

      system.setView(view);
      expect(system.update(0.2)).toBe(true);

      const direction = camera.position
        .clone()
        .sub(controls.target)
        .normalize()
        .toArray();
      expect(direction[0]).toBeCloseTo(expected[0], 5);
      expect(direction[1]).toBeCloseTo(expected[1], 5);
      expect(direction[2]).toBeCloseTo(expected[2], 5);
      expect(camera.position.distanceTo(controls.target)).toBeCloseTo(
        distance,
        5,
      );
    }
  });

  it('重置到构造时的默认视角并可取消进行中的动画', () => {
    const { camera, controls, system } = createFixture();
    const defaultPosition = camera.position.clone();
    const defaultTarget = controls.target.clone();
    system.setView('top');
    system.update(0.08);
    system.cancel();
    const cancelledPosition = camera.position.clone();

    expect(system.update(1)).toBe(false);
    expect(camera.position).toEqual(cancelledPosition);

    system.reset();
    system.update(0.2);
    expect(camera.position.toArray()).toEqual(defaultPosition.toArray());
    expect(controls.target.toArray()).toEqual(defaultTarget.toArray());
  });

  it('用户缩放后切换方向时保持当前距离而不是跳回默认距离', () => {
    const { camera, controls, system } = createFixture();
    camera.position.copy(controls.target).add(new Vector3(0, 0, 3));

    system.setView('right');
    system.update(1);

    expect(camera.position.distanceTo(controls.target)).toBeCloseTo(3, 5);
  });

  it('相机与 target 重合时使用默认距离，方向 DTO 只包含数值元组', () => {
    const { camera, controls, system } = createFixture();
    camera.position.copy(controls.target);

    system.setView('front');
    system.update(1);

    expect(camera.position.distanceTo(controls.target)).toBeGreaterThan(1);
    expect(system.getOrientation().quaternion).toHaveLength(4);
    expect(system.getOrientation().quaternion.every(Number.isFinite)).toBe(
      true,
    );
  });
});
