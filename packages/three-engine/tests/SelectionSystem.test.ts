import {
  BoxGeometry,
  EventDispatcher,
  Group,
  Mesh,
  MeshBasicMaterial,
  PerspectiveCamera,
  Scene,
  Vector3,
  type Object3D,
} from 'three';
import { describe, expect, it, vi } from 'vitest';
import { SelectionSystem } from '../src/index.js';

class CanvasStub extends EventTarget {
  readonly style = {};

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
  clientX: number,
  clientY: number,
  modifiers: { ctrlKey?: boolean; metaKey?: boolean } = {},
): PointerEvent {
  const event = new Event(type) as PointerEvent;
  Object.defineProperties(event, {
    button: { value: 0 },
    clientX: { value: clientX },
    clientY: { value: clientY },
    ctrlKey: { value: modifiers.ctrlKey ?? false },
    metaKey: { value: modifiers.metaKey ?? false },
  });
  return event;
}

function screenPoint(
  world: Vector3,
  camera: PerspectiveCamera,
  rect: DOMRect,
): [number, number] {
  const ndc = world.clone().project(camera);
  return [
    rect.left + ((ndc.x + 1) / 2) * rect.width,
    rect.top + ((1 - ndc.y) / 2) * rect.height,
  ];
}

function businessNode(id: string, x: number): Group {
  const root = new Group();
  root.userData.sceneNodeId = id;
  root.position.x = x;
  // Raycaster 命中的是模型内部 Mesh，而不是业务节点根对象。
  root.add(new Mesh(new BoxGeometry(), new MeshBasicMaterial()));
  return root;
}

describe('SelectionSystem', () => {
  it('使用 canvas 矩形计算射线并将子 Mesh 上溯为业务根节点', () => {
    const canvas = new CanvasStub();
    const camera = new PerspectiveCamera(50, 2, 0.1, 100);
    camera.position.set(0, 0, 5);
    camera.lookAt(0, 0, 0);
    camera.updateMatrixWorld();
    const sceneRoot = new Scene();
    const node = businessNode('node-1', 0);
    sceneRoot.add(node);
    sceneRoot.updateMatrixWorld(true);
    const highlighted: Object3D[] = [];
    const highlight = {
      setObjects: vi.fn((objects: Object3D[]) => {
        highlighted.splice(0, highlighted.length, ...objects);
      }),
      clear: vi.fn(() => highlighted.splice(0)),
    };
    const selection = new SelectionSystem({
      camera,
      canvas: canvas as unknown as HTMLElement,
      root: sceneRoot,
      getNodeId: (object) => {
        let current: Object3D | null = object;
        while (current) {
          if (typeof current.userData.sceneNodeId === 'string') {
            return current.userData.sceneNodeId;
          }
          current = current.parent;
        }
        return undefined;
      },
      getObject: (id) => (id === 'node-1' ? node : undefined),
      highlight,
    });

    const [x, y] = screenPoint(
      new Vector3(),
      camera,
      canvas.getBoundingClientRect(),
    );
    selection.selectAt(x, y);

    expect(selection.getSelection()).toEqual({
      ids: ['node-1'],
      primaryId: 'node-1',
    });
    expect(highlighted).toEqual([node]);
    selection.dispose();
    expect(highlight.clear).toHaveBeenCalledOnce();
  });

  it('支持 Ctrl/Cmd 多选、再次点击取消以及空白处清空', () => {
    const canvas = new CanvasStub();
    const camera = new PerspectiveCamera(50, 2, 0.1, 100);
    camera.position.set(0, 0, 5);
    camera.lookAt(0, 0, 0);
    camera.updateMatrixWorld();
    const sceneRoot = new Scene();
    const left = businessNode('left', -1);
    const right = businessNode('right', 1);
    sceneRoot.add(left, right);
    sceneRoot.updateMatrixWorld(true);
    const objects = new Map([
      ['left', left],
      ['right', right],
    ]);
    const changes = vi.fn();
    const selection = new SelectionSystem({
      camera,
      canvas: canvas as unknown as HTMLElement,
      root: sceneRoot,
      getNodeId: (object) => {
        let current: Object3D | null = object;
        while (current) {
          if (typeof current.userData.sceneNodeId === 'string') {
            return current.userData.sceneNodeId;
          }
          current = current.parent;
        }
        return undefined;
      },
      getObject: (id) => objects.get(id),
      highlight: { setObjects: vi.fn(), clear: vi.fn() },
      onSelectionChange: changes,
    });
    const rect = canvas.getBoundingClientRect();
    const [leftX, leftY] = screenPoint(new Vector3(-1, 0, 0), camera, rect);
    const [rightX, rightY] = screenPoint(new Vector3(1, 0, 0), camera, rect);

    selection.selectAt(leftX, leftY);
    selection.selectAt(rightX, rightY, true);
    expect(selection.getSelection()).toEqual({
      ids: ['left', 'right'],
      primaryId: 'right',
    });

    selection.selectAt(rightX, rightY, true);
    expect(selection.getSelection()).toEqual({
      ids: ['left'],
      primaryId: 'left',
    });

    selection.selectAt(rect.right - 1, rect.top + 1);
    expect(selection.getSelection()).toEqual({ ids: [], primaryId: null });
    expect(changes).toHaveBeenLastCalledWith({ ids: [], primaryId: null });
    selection.dispose();
  });

  it('节点 ID 未变但运行对象被重建时刷新高亮引用且不重复派发选择事件', () => {
    const canvas = new CanvasStub();
    const camera = new PerspectiveCamera();
    const sceneRoot = new Scene();
    let currentObject: Object3D = businessNode('node-1', 0);
    const highlight = { setObjects: vi.fn(), clear: vi.fn() };
    const changes = vi.fn();
    const selection = new SelectionSystem({
      camera,
      canvas: canvas as unknown as HTMLElement,
      root: sceneRoot,
      getNodeId: () => 'node-1',
      getObject: () => currentObject,
      highlight,
      onSelectionChange: changes,
    });

    selection.setSelection(['node-1'], 'node-1');
    const replacement = businessNode('node-1', 1);
    currentObject = replacement;
    selection.setSelection(['node-1'], 'node-1');

    expect(highlight.setObjects).toHaveBeenLastCalledWith([replacement]);
    expect(changes).toHaveBeenCalledOnce();
    selection.dispose();
  });

  it('OrbitControls 已拖动时不把 pointerup 误判为选择点击', () => {
    const canvas = new CanvasStub();
    const controls = new EventDispatcher<{ change: object }>();
    const camera = new PerspectiveCamera(50, 2, 0.1, 100);
    camera.position.set(0, 0, 5);
    camera.lookAt(0, 0, 0);
    camera.updateMatrixWorld();
    const sceneRoot = new Scene();
    const node = businessNode('node-1', 0);
    sceneRoot.add(node);
    sceneRoot.updateMatrixWorld(true);
    const selection = new SelectionSystem({
      camera,
      canvas: canvas as unknown as HTMLElement,
      root: sceneRoot,
      getNodeId: () => 'node-1',
      getObject: () => node,
      highlight: { setObjects: vi.fn(), clear: vi.fn() },
      orbitControls: controls,
    });

    canvas.dispatchEvent(pointerEvent('pointerdown', 300, 150));
    controls.dispatchEvent({ type: 'change' });
    canvas.dispatchEvent(pointerEvent('pointerup', 300, 150));

    expect(selection.getSelection().ids).toEqual([]);
    selection.dispose();
  });
});
