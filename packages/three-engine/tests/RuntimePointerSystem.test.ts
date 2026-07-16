import {
  BoxGeometry,
  Group,
  Mesh,
  MeshBasicMaterial,
  PerspectiveCamera,
  Vector3,
  type Object3D,
} from 'three';
import { describe, expect, it, vi } from 'vitest';
import { RuntimePointerSystem } from '../src/index.js';

class CanvasStub extends EventTarget {
  readonly style = {};

  getBoundingClientRect(): DOMRect {
    return {
      left: 120,
      top: 40,
      width: 400,
      height: 200,
      right: 520,
      bottom: 240,
      x: 120,
      y: 40,
      toJSON: () => ({}),
    };
  }
}

function pointerEvent(type: string, clientX: number, clientY: number): Event {
  const event = new Event(type);
  Object.defineProperties(event, {
    button: { value: 0 },
    clientX: { value: clientX },
    clientY: { value: clientY },
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

describe('RuntimePointerSystem', () => {
  it('使用 canvas rect 射线命中子 Mesh 并派发业务节点 click', () => {
    const canvas = new CanvasStub();
    const camera = new PerspectiveCamera(50, 2, 0.1, 100);
    camera.position.set(0, 0, 5);
    camera.lookAt(0, 0, 0);
    camera.updateMatrixWorld();
    const root = new Group();
    const businessRoot = new Group();
    businessRoot.userData.sceneNodeId = 'device';
    businessRoot.add(
      new Mesh(new BoxGeometry(), new MeshBasicMaterial({ color: '#fff' })),
    );
    root.add(businessRoot);
    root.updateMatrixWorld(true);
    const listener = vi.fn();
    const pointers = new RuntimePointerSystem({
      camera,
      canvas: canvas as unknown as HTMLElement,
      root,
      getNodeId(object: Object3D) {
        let current: Object3D | null = object;
        while (current) {
          if (typeof current.userData.sceneNodeId === 'string') {
            return current.userData.sceneNodeId;
          }
          current = current.parent;
        }
        return undefined;
      },
    });
    const unsubscribe = pointers.subscribe('device', 'click', listener);
    const [x, y] = screenPoint(
      new Vector3(),
      camera,
      canvas.getBoundingClientRect(),
    );

    canvas.dispatchEvent(pointerEvent('pointerdown', x, y));
    canvas.dispatchEvent(pointerEvent('pointerup', x, y));

    expect(listener).toHaveBeenCalledOnce();
    unsubscribe();
    pointers.dispose();
  });
});
