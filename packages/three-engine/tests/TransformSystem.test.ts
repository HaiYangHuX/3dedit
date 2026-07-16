import { Group, PerspectiveCamera, Scene } from 'three';
import { describe, expect, it, vi } from 'vitest';
import {
  TransformSystem,
  ViewportDropSystem,
  type TransformCommit,
} from '../src/index.js';

class CanvasStub extends EventTarget {
  readonly style: Record<string, string> = {};

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

describe('TransformSystem', () => {
  it('mouseDown 保存 before，mouseUp 仅提交一次 after', () => {
    const scene = new Scene();
    const camera = new PerspectiveCamera();
    const canvas = new CanvasStub();
    const node = new Group();
    node.userData.sceneNodeId = 'node-1';
    node.position.set(1, 2, 3);
    scene.add(node);
    const commits: TransformCommit[] = [];
    const changes = vi.fn();
    const system = new TransformSystem({
      scene,
      camera,
      canvas: canvas as unknown as HTMLElement,
      getObject: (id) => (id === 'node-1' ? node : undefined),
      onTransformChange: changes,
      onTransformEnd: (commit) => commits.push(commit),
    });
    system.setSelection('node-1');

    system.controls.dispatchEvent({ type: 'mouseDown', mode: 'translate' });
    node.position.set(4, 5, 6);
    system.controls.dispatchEvent({ type: 'objectChange' });
    system.controls.dispatchEvent({ type: 'mouseUp', mode: 'translate' });
    system.controls.dispatchEvent({ type: 'mouseUp', mode: 'translate' });

    expect(changes).toHaveBeenCalledWith(
      'node-1',
      expect.objectContaining({ position: [4, 5, 6] }),
    );
    expect(commits).toEqual([
      {
        nodeId: 'node-1',
        before: {
          position: [1, 2, 3],
          rotation: [0, 0, 0],
          scale: [1, 1, 1],
        },
        after: {
          position: [4, 5, 6],
          rotation: [0, 0, 0],
          scale: [1, 1, 1],
        },
      },
    ]);
    system.dispose();
  });

  it('锁定节点不会 attach，并可切换 W/E/R 模式与 local/world 空间', () => {
    const scene = new Scene();
    const node = new Group();
    node.userData.locked = true;
    scene.add(node);
    const system = new TransformSystem({
      scene,
      camera: new PerspectiveCamera(),
      canvas: new CanvasStub() as unknown as HTMLElement,
      getObject: () => node,
    });

    system.setSelection('locked-node');
    expect(system.controls.object).toBeUndefined();

    node.userData.locked = false;
    system.setSelection('locked-node');
    system.setMode('rotate');
    system.setSpace('local');
    expect(system.controls.object).toBe(node);
    expect(system.controls.getMode()).toBe('rotate');
    expect(system.controls.space).toBe('local');

    system.setMode('scale');
    system.setSpace('world');
    expect(system.controls.getMode()).toBe('scale');
    expect(system.controls.space).toBe('world');
    system.dispose();
  });

  it('手柄模式切换只请求重绘，不会误报为对象变换', () => {
    const scene = new Scene();
    const node = new Group();
    scene.add(node);
    const invalidate = vi.fn();
    const objectChange = vi.fn();
    const system = new TransformSystem({
      scene,
      camera: new PerspectiveCamera(),
      canvas: new CanvasStub() as unknown as HTMLElement,
      getObject: () => node,
      onChange: invalidate,
      onTransformChange: objectChange,
    });
    system.setSelection('node-1');

    system.setMode('rotate');

    expect(invalidate).toHaveBeenCalled();
    expect(objectChange).not.toHaveBeenCalled();
    system.dispose();
  });
});

describe('ViewportDropSystem', () => {
  it('使用 canvas 射线与 y=0 平面求交并执行网格吸附', () => {
    const camera = new PerspectiveCamera(50, 2, 0.1, 100);
    camera.position.set(0, 5, 5);
    camera.lookAt(0, 0, 0);
    camera.updateMatrixWorld();
    const drop = new ViewportDropSystem(
      camera,
      new CanvasStub() as unknown as HTMLElement,
    );

    const position = drop.getWorldPosition(337, 150, 0.5);

    expect(position.y).toBe(0);
    expect(position.x / 0.5).toBeCloseTo(Math.round(position.x / 0.5));
    expect(position.z / 0.5).toBeCloseTo(Math.round(position.z / 0.5));
  });

  it('射线与地面平行时退化到相机前方固定距离', () => {
    const camera = new PerspectiveCamera(50, 2, 0.1, 100);
    camera.position.set(0, 2, 5);
    camera.lookAt(0, 2, 0);
    camera.updateMatrixWorld();
    const drop = new ViewportDropSystem(
      camera,
      new CanvasStub() as unknown as HTMLElement,
      { fallbackDistance: 5 },
    );

    const position = drop.getWorldPosition(300, 150);

    expect(position.toArray()).toEqual([0, 2, 0]);
  });
});
