import {
  DoubleSide,
  Group,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  PerspectiveCamera,
  PlaneGeometry,
  Scene,
  Vector3,
  type Object3D,
} from 'three';
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

function addHorizontalSurface(parent: Object3D, y: number): Mesh {
  const surface = new Mesh(
    new PlaneGeometry(20, 20),
    new MeshBasicMaterial({ side: DoubleSide }),
  );
  surface.rotation.x = -Math.PI / 2;
  surface.position.y = y;
  parent.add(surface);
  return surface;
}

function createSurfaceHarness() {
  const scene = new Scene();
  const root = new Group();
  scene.add(root);
  let surfaceRoot: Object3D | undefined = root;
  const camera = new PerspectiveCamera(60, 2, 0.1, 100);
  camera.position.set(0, 8, 8);
  camera.lookAt(0, 4, 0);
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld(true);
  const canvas = new CanvasStub();
  const keyboardTarget = new EventTarget();
  const onPathCreated = vi.fn();
  const system = new CameraRoamingSystem({
    scene,
    camera,
    canvas: canvas as unknown as HTMLElement,
    controls: { enabled: true },
    keyboardTarget,
    getSurfaceRoot: () => surfaceRoot,
    onPathCreated,
    invalidate: vi.fn(),
  });

  return {
    scene,
    root,
    system,
    setSurfaceRoot(root: Object3D | undefined) {
      surfaceRoot = root;
    },
    drawCenterPoints(): Array<[number, number, number]> {
      system.startDrawing();
      keyboardTarget.dispatchEvent(keyboardEvent('keydown', 'Control'));
      for (let index = 0; index < 2; index += 1) {
        canvas.dispatchEvent(pointerEvent('pointerdown', 300, 150));
        canvas.dispatchEvent(pointerEvent('pointerup', 300, 150));
      }
      keyboardTarget.dispatchEvent(keyboardEvent('keyup', 'Control'));
      return onPathCreated.mock.calls[0]![0];
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
  it('selects the nearest upward surface from the current business root at click time', () => {
    const harness = createSurfaceHarness();
    addHorizontalSurface(harness.root, 6);
    const replacementRoot = new Group();
    harness.scene.add(replacementRoot);
    addHorizontalSurface(replacementRoot, 2);
    addHorizontalSurface(replacementRoot, 4);
    harness.setSurfaceRoot(replacementRoot);

    const points = harness.drawCenterPoints();

    expect(points).toHaveLength(2);
    expect(points[0]![0]).toBeCloseTo(0);
    expect(points[0]![1]).toBeCloseTo(4.55);
    expect(points[0]![2]).toBeCloseTo(0);
    harness.system.dispose();
  });

  it('skips hidden and editor-helper surfaces', () => {
    const harness = createSurfaceHarness();
    const hidden = new Group();
    hidden.visible = false;
    addHorizontalSurface(hidden, 6);
    harness.root.add(hidden);
    const helper = new Group();
    helper.userData.editorHelper = true;
    addHorizontalSurface(helper, 5);
    harness.root.add(helper);
    addHorizontalSurface(harness.root, 3);

    const points = harness.drawCenterPoints();

    expect(points[0]![1]).toBeCloseTo(3.55);
    harness.system.dispose();
  });

  it('falls back to the world ground when no qualifying business surface exists', () => {
    const harness = createSurfaceHarness();
    const wall = new Mesh(
      new PlaneGeometry(20, 20),
      new MeshBasicMaterial({ side: DoubleSide }),
    );
    wall.position.y = 4;
    harness.root.add(wall);

    const points = harness.drawCenterPoints();

    expect(points[0]![1]).toBeCloseTo(0.55);
    harness.system.dispose();
  });

  it('uses an InstancedMesh transform to classify upward and vertical surfaces', () => {
    const upwardHarness = createSurfaceHarness();
    const upwardSurface = new InstancedMesh(
      new PlaneGeometry(20, 20),
      new MeshBasicMaterial({ side: DoubleSide }),
      1,
    );
    upwardSurface.setMatrixAt(
      0,
      new Matrix4().makeRotationX(-Math.PI / 2).setPosition(0, 4, 0),
    );
    upwardHarness.root.add(upwardSurface);

    const upwardPoints = upwardHarness.drawCenterPoints();

    expect(upwardPoints[0]![1]).toBeCloseTo(4.55);
    upwardHarness.system.dispose();

    const wallHarness = createSurfaceHarness();
    const verticalSurface = new InstancedMesh(
      new PlaneGeometry(20, 20),
      new MeshBasicMaterial({ side: DoubleSide }),
      1,
    );
    verticalSurface.setMatrixAt(0, new Matrix4().makeTranslation(0, 4, 0));
    wallHarness.root.add(verticalSurface);

    const wallPoints = wallHarness.drawCenterPoints();

    expect(wallPoints[0]![1]).toBeCloseTo(0.55);
    wallHarness.system.dispose();
  });

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

  it('按路径点高度增加 1.45 播放高台路径', () => {
    const harness = createHarness();
    const elevatedPath: CameraRoamingPath = {
      ...path,
      id: 'elevated-path',
      pathPoints: [
        [0, 4.55, 0],
        [4, 4.55, 0],
      ],
    };

    expect(harness.system.preview(elevatedPath)).toBe(true);
    expect(harness.camera.position.toArray()).toEqual([0, 6, 0]);
    harness.system.update(2);
    expect(harness.camera.position.toArray()).toEqual([4, 6, 0]);
    harness.system.dispose();
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
