import {
  DoubleSide,
  Mesh,
  MeshBasicMaterial,
  PerspectiveCamera,
  PlaneGeometry,
  Scene,
  Vector3,
} from 'three';
import type { CameraRoamingPath } from '@digital-twin/scene-schema';
import { describe, expect, it, vi } from 'vitest';
import { CameraRoamingSystem } from '../src/camera/CameraRoamingSystem.js';

class CanvasStub extends EventTarget {
  constructor(
    private readonly rect: Pick<
      DOMRect,
      'left' | 'top' | 'width' | 'height'
    > = {
      left: 100,
      top: 50,
      width: 400,
      height: 200,
    },
  ) {
    super();
  }

  getBoundingClientRect(): DOMRect {
    return {
      ...this.rect,
      right: this.rect.left + this.rect.width,
      bottom: this.rect.top + this.rect.height,
      x: this.rect.left,
      y: this.rect.top,
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

function addHorizontalSurface(parent: Scene, y: number): Mesh {
  const surface = new Mesh(
    new PlaneGeometry(20, 20),
    new MeshBasicMaterial({ side: DoubleSide }),
  );
  surface.rotation.x = -Math.PI / 2;
  surface.position.y = y;
  parent.add(surface);
  return surface;
}

function createProjectionHarness() {
  const scene = new Scene();
  const camera = new PerspectiveCamera(60, 2, 0.1, 1_000);
  camera.position.set(0, 8, 8);
  camera.lookAt(0, 0, 0);
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld(true);
  const canvas = new CanvasStub();
  const keyboardTarget = new EventTarget();
  const onPathCreated = vi.fn();
  // 额外的 getSurfaceRoot 仅用于证明旧实现会偏离；源站算法必须忽略模型表面。
  const options = {
    scene,
    camera,
    canvas: canvas as unknown as HTMLElement,
    controls: { enabled: true },
    keyboardTarget,
    getSurfaceRoot: () => scene,
    onPathCreated,
    invalidate: vi.fn(),
  };
  const system = new CameraRoamingSystem(options);

  return {
    scene,
    camera,
    system,
    onPathCreated,
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
  speed: 4,
  pathPoints: [
    [0, 0.55, 0],
    [4, 0.55, 0],
    [4, 0.55, 4],
  ],
};

describe('CameraRoamingSystem', () => {
  it('按源站投影到世界地面，不被点击位置的高台表面吸附', () => {
    const harness = createProjectionHarness();
    addHorizontalSurface(harness.scene, 4);

    const points = harness.drawCenterPoints();

    expect(points).toHaveLength(2);
    expect(points[0]![0]).toBeCloseTo(0);
    expect(points[0]![1]).toBeCloseTo(0.55);
    expect(points[0]![2]).toBeCloseTo(0);
    harness.system.dispose();
  });

  it('射线与地面平行时使用相机前方回退点，不丢弃用户点击', () => {
    const harness = createProjectionHarness();
    harness.camera.position.set(0, 2, 8);
    harness.camera.lookAt(0, 2, -100);
    harness.camera.updateProjectionMatrix();
    harness.camera.updateMatrixWorld(true);

    const points = harness.drawCenterPoints();

    expect(points).toHaveLength(2);
    expect(points[0]!.every(Number.isFinite)).toBe(true);
    expect(points[0]![1]).toBeGreaterThanOrEqual(0.55);
    harness.system.dispose();
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

  it('以速度 4、源站 1.4 高度偏移和最短 400ms 播放，并在完成后恢复 Orbit', () => {
    const harness = createHarness();

    expect(harness.system.preview(path)).toBe(true);
    expect(harness.controls.enabled).toBe(false);
    expect(harness.camera.position.x).toBeCloseTo(0);
    expect(harness.camera.position.y).toBeCloseTo(1.95);
    expect(harness.camera.position.z).toBeCloseTo(0);
    const initialQuaternion = harness.camera.quaternion.clone();

    harness.system.update(0.5);
    expect(harness.camera.position.x).toBeCloseTo(2);
    harness.system.update(0.4);
    expect(harness.camera.quaternion.equals(initialQuaternion)).toBe(false);
    harness.system.update(0.1);
    harness.system.update(1);

    expect(harness.camera.position.x).toBeCloseTo(4);
    expect(harness.camera.position.y).toBeCloseTo(1.95);
    expect(harness.camera.position.z).toBeCloseTo(4);
    expect(harness.controls.enabled).toBe(true);
    expect(harness.system.getState().mode).toBe('idle');
    expect(harness.scene.children).toHaveLength(0);
  });

  it('按每条路径的速度计算分段进度', () => {
    const harness = createHarness();
    const slowPath: CameraRoamingPath = {
      ...path,
      id: 'slow-path',
      speed: 2,
      pathPoints: [
        [0, 0.55, 0],
        [4, 0.55, 0],
      ],
    };

    expect(harness.system.preview(slowPath)).toBe(true);
    harness.system.update(0.5);

    expect(harness.camera.position.x).toBeCloseTo(1);
    harness.system.dispose();
  });

  it('按路径点高度增加 1.4 播放高台路径', () => {
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
    expect(harness.camera.position.x).toBeCloseTo(0);
    expect(harness.camera.position.y).toBeCloseTo(5.95);
    expect(harness.camera.position.z).toBeCloseTo(0);
    harness.system.update(2);
    expect(harness.camera.position.x).toBeCloseTo(4);
    expect(harness.camera.position.y).toBeCloseTo(5.95);
    expect(harness.camera.position.z).toBeCloseTo(0);
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

  it('鼠标经过时独立显示路径，并按首末索引派生起点和终点', () => {
    const harness = createHarness();

    expect(harness.system.showHoverPath(path)).toBe(true);
    const hoverGroup = harness.scene.children.find(
      (child) => child.userData.cameraRoamingVisualKind === 'hover',
    );
    const roles: string[] = [];
    hoverGroup?.traverse((object) => {
      if (typeof object.userData.cameraRoamingRole === 'string') {
        roles.push(object.userData.cameraRoamingRole);
      }
    });

    expect(roles).toEqual(['start', 'waypoint', 'end']);
    expect(
      hoverGroup?.getObjectByName('camera-roaming-marker-0')?.userData
        .cameraRoamingLabel,
    ).toBe('S');
    expect(
      hoverGroup?.getObjectByName('camera-roaming-marker-2')?.userData
        .cameraRoamingLabel,
    ).toBe('E');

    harness.system.hideHoverPath();
    expect(
      harness.scene.children.some(
        (child) => child.userData.cameraRoamingVisualKind === 'hover',
      ),
    ).toBe(false);
    harness.system.dispose();
  });
});
