// @vitest-environment happy-dom

import { EventDispatcher, PerspectiveCamera, Scene, Vector3 } from 'three';
import { describe, expect, it, vi } from 'vitest';
import {
  Css3DOverlaySystem,
  type Css3DRendererLike,
  type LinkedOrbitControls,
} from '../src/index.js';

interface FakeControlEventMap {
  change: object;
}

class FakeControls extends EventDispatcher<FakeControlEventMap> {
  enablePan = false;
  enableZoom = false;
  enableDamping = false;
  enabled = true;
  target = new Vector3();
  maxDistance = Infinity;
  maxPolarAngle = Math.PI;
  zoomSpeed = 1;
  rotateSpeed = 1;
  panSpeed = 1;
  screenSpacePanning = true;
  mouseButtons = {};
  update = vi.fn(() => false);
  dispose = vi.fn();
}

describe('Css3DOverlaySystem', () => {
  it('挂载、渲染、缩放并双向同步相机控制目标', () => {
    const scene = new Scene();
    const camera = new PerspectiveCamera();
    const container = document.createElement('div');
    const primary = new FakeControls();
    primary.target.set(1, 2, 3);
    const overlayControls = new FakeControls();
    const domElement = document.createElement('div');
    const renderer: Css3DRendererLike = {
      domElement,
      render: vi.fn(),
      setSize: vi.fn(),
    };
    const invalidate = vi.fn();

    const system = new Css3DOverlaySystem({
      scene,
      camera,
      container,
      primaryControls: primary as LinkedOrbitControls,
      invalidate,
      createRenderer: () => renderer,
      createControls: () => overlayControls as LinkedOrbitControls,
    });

    expect(container.lastElementChild).toBe(domElement);
    expect(domElement.style.position).toBe('absolute');
    expect(domElement.style.pointerEvents).toBe('none');
    expect(overlayControls.target.toArray()).toEqual([1, 2, 3]);

    primary.target.set(4, 5, 6);
    primary.dispatchEvent({ type: 'change' });
    expect(overlayControls.target.toArray()).toEqual([4, 5, 6]);

    overlayControls.target.set(7, 8, 9);
    overlayControls.dispatchEvent({ type: 'change' });
    expect(primary.target.toArray()).toEqual([7, 8, 9]);
    expect(invalidate).toHaveBeenCalled();

    system.resize(960, 540);
    system.render();
    expect(renderer.setSize).toHaveBeenCalledWith(960, 540);
    expect(renderer.render).toHaveBeenCalledWith(scene, camera);

    system.dispose();
    expect(overlayControls.dispose).toHaveBeenCalledOnce();
    expect(domElement.isConnected).toBe(false);
  });
});
