import { MOUSE, Vector3 } from 'three';
import { describe, expect, it, vi } from 'vitest';
import {
  configureOrbitControls,
  type OrbitControlsLike,
} from '../src/interaction/OrbitControlsProfile';

function createControls(): OrbitControlsLike {
  return {
    enablePan: false,
    enableZoom: false,
    enableDamping: false,
    target: new Vector3(3, 2, 1),
    maxDistance: Number.POSITIVE_INFINITY,
    mouseButtons: {
      LEFT: MOUSE.ROTATE,
      MIDDLE: MOUSE.DOLLY,
      RIGHT: MOUSE.PAN,
    },
    screenSpacePanning: true,
    zoomSpeed: 1,
    rotateSpeed: 1,
    panSpeed: 1,
    maxPolarAngle: Math.PI,
    update: vi.fn(),
  };
}

describe('OrbitControls 源站交互配置', () => {
  it('复现原站当前编辑器的鼠标映射和视角限制', () => {
    const editorControls = createControls();
    configureOrbitControls(editorControls, { enablePan: true });

    expect(editorControls.enablePan).toBe(true);
    expect(editorControls.enableZoom).toBe(true);
    expect(editorControls.enableDamping).toBe(false);
    expect(editorControls.mouseButtons).toEqual({
      LEFT: MOUSE.PAN,
      MIDDLE: MOUSE.DOLLY,
      RIGHT: MOUSE.ROTATE,
    });
    expect(editorControls.screenSpacePanning).toBe(false);
    expect(editorControls.zoomSpeed).toBe(1.5);
    expect(editorControls.rotateSpeed).toBe(1);
    expect(editorControls.panSpeed).toBe(1);
    expect(editorControls.maxDistance).toBe(200);
    expect(editorControls.target.toArray()).toEqual([0, 0.5, 0]);
    expect(editorControls.maxPolarAngle).toBeCloseTo(Math.PI / 2);
    expect(editorControls.update).toHaveBeenCalledTimes(1);
  });
});
