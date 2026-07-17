import { PerspectiveCamera, Scene, Vector3 } from 'three';
import type { CameraRoamingPath } from '@digital-twin/scene-schema';
import { describe, expect, it, vi } from 'vitest';
import { CameraRoamingSystem } from '../src/camera/CameraRoamingSystem.js';

class CanvasStub extends EventTarget {
  getBoundingClientRect(): DOMRect {
    return {
      left: 100,
      top: 50,
      width: 400,
      height: 200,
      right: 500,
      bottom: 250,
      x: 100,
      y: 50,
      toJSON: () => ({}),
    };
  }
}

function pointerEvent(
  type: string,
  x: number,
  y: number,
  modifier = true,
): PointerEvent {
  const event = new Event(type) as PointerEvent;
  Object.defineProperties(event, {
    button: { value: 0 },
    clientX: { value: x },
    clientY: { value: y },
    ctrlKey: { value: modifier },
    metaKey: { value: false },
  });
  return event;
}

function keyboardEvent(type: string, key: string): KeyboardEvent {
  const event = new Event(type) as KeyboardEvent;
  Object.defineProperty(event, 'key', { value: key });
  return event;
}

function createHarness() {
  const scene = new Scene();
  const camera = new PerspectiveCamera();
  camera.position.set(0, 4, 8);
  const canvas = new CanvasStub();
  const keyboardTarget = new EventTarget();
  const controls = { enabled: true };
  const onPathCreated = vi.fn();
  const onStateChange = vi.fn();
  const invalidate = vi.fn();
  let now = 0;
  const system = new CameraRoamingSystem({
    scene,
    camera,
    canvas: canvas as unknown as HTMLElement,
    controls,
    keyboardTarget,
    now: () => now,
    projectPoint: (x, y) => new Vector3(x / 10, 0.55, y / 10),
    onPathCreated,
    onStateChange,
    invalidate,
  });
  return {
    scene,
    camera,
    canvas,
    keyboardTarget,
    controls,
    onPathCreated,
    onStateChange,
    invalidate,
    system,
    advance(milliseconds: number) {
      now += milliseconds;
    },
  };
}

const path: CameraRoamingPath = {
  id: 'path-1',
  name: '漫游路径 1',
  pathPoints: [
    [0, 0.55, 0],
    [4, 0.55, 0],
    [4, 0.55, 4],
  ],
};

describe('CameraRoamingSystem', () => {
  it('Ctrl/Command + 250ms/5px 点击定点，松开修饰键后提交至少两点路径', () => {
    const harness = createHarness();
    harness.system.startDrawing();
    harness.keyboardTarget.dispatchEvent(keyboardEvent('keydown', 'Control'));

    harness.canvas.dispatchEvent(pointerEvent('pointerdown', 200, 100));
    harness.advance(250);
    harness.canvas.dispatchEvent(pointerEvent('pointerup', 203, 104));
    harness.canvas.dispatchEvent(pointerEvent('pointerdown', 300, 150));
    harness.advance(100);
    harness.canvas.dispatchEvent(pointerEvent('pointerup', 300, 150));
    harness.keyboardTarget.dispatchEvent(keyboardEvent('keyup', 'Control'));

    expect(harness.onPathCreated).toHaveBeenCalledWith([
      [20.3, 0.55, 10.4],
      [30, 0.55, 15],
    ]);
    expect(harness.system.getState().mode).toBe('idle');
    expect(harness.scene.children).toHaveLength(0);
    harness.system.dispose();
  });

  it('超过点击时间或位移门槛不增加路径点，少于两点时保持可继续绘制', () => {
    const harness = createHarness();
    harness.system.startDrawing();
    harness.keyboardTarget.dispatchEvent(keyboardEvent('keydown', 'Meta'));
    harness.canvas.dispatchEvent(pointerEvent('pointerdown', 200, 100));
    harness.advance(251);
    harness.canvas.dispatchEvent(pointerEvent('pointerup', 200, 100));
    harness.canvas.dispatchEvent(pointerEvent('pointerdown', 200, 100));
    harness.advance(10);
    harness.canvas.dispatchEvent(pointerEvent('pointerup', 206, 100));
    harness.keyboardTarget.dispatchEvent(keyboardEvent('keyup', 'Meta'));

    expect(harness.onPathCreated).not.toHaveBeenCalled();
    expect(harness.system.getState()).toMatchObject({
      mode: 'drawing',
      pointCount: 0,
    });
    harness.system.cancelDrawing();
    expect(harness.system.getState().mode).toBe('idle');
  });

  it('以速度 4、眼高 2 和最短 400ms 播放，并在完成后恢复 Orbit', () => {
    const harness = createHarness();

    expect(harness.system.preview(path)).toBe(true);
    expect(harness.controls.enabled).toBe(false);
    expect(harness.camera.position.toArray()).toEqual([0, 2, 0]);
    const initialQuaternion = harness.camera.quaternion.clone();

    harness.system.update(0.5);
    expect(harness.camera.position.x).toBeCloseTo(2);
    harness.system.update(0.4);
    expect(harness.camera.quaternion.equals(initialQuaternion)).toBe(false);
    harness.system.update(0.1);
    harness.system.update(1);

    expect(harness.camera.position.toArray()).toEqual([4, 2, 4]);
    expect(harness.controls.enabled).toBe(true);
    expect(harness.system.getState().mode).toBe('idle');
    expect(harness.scene.children).toHaveLength(0);
  });

  it('跳过重复点并保证绘制、播放和销毁互斥', () => {
    const harness = createHarness();
    const duplicatePath: CameraRoamingPath = {
      ...path,
      pathPoints: [
        [0, 0.55, 0],
        [0, 0.55, 0],
        [1, 0.55, 0],
      ],
    };

    expect(harness.system.preview(duplicatePath)).toBe(true);
    expect(harness.system.getState().mode).toBe('previewing');
    harness.system.startDrawing();
    expect(harness.system.getState().mode).toBe('drawing');
    expect(harness.controls.enabled).toBe(true);

    harness.system.dispose();
    expect(harness.system.getState().mode).toBe('idle');
    expect(harness.scene.children).toHaveLength(0);
  });
});
