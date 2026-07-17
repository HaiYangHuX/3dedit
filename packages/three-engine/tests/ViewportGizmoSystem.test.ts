import { EventDispatcher, PerspectiveCamera } from 'three';
import { describe, expect, it, vi } from 'vitest';
import {
  ViewportGizmoSystem,
  type ViewportGizmoAdapter,
} from '../src/interaction/ViewportGizmoSystem.js';

class FakeGizmo
  extends EventDispatcher<{ start: object; change: object; end: object }>
  implements ViewportGizmoAdapter
{
  animating = false;
  readonly attachControls = vi.fn(() => this);
  readonly update = vi.fn(() => this);
  readonly render = vi.fn(() => this);
  readonly dispose = vi.fn();
}

describe('ViewportGizmoSystem', () => {
  it('使用源站 cube 参数绑定 OrbitControls，并转发更新、渲染与释放', () => {
    const gizmo = new FakeGizmo();
    const createGizmo = vi.fn(() => gizmo);
    const invalidate = vi.fn();
    const container = {} as HTMLElement;
    const camera = new PerspectiveCamera();
    const renderer = {} as never;
    const controls = {} as never;
    const system = new ViewportGizmoSystem({
      camera,
      renderer,
      controls,
      container,
      invalidate,
      createGizmo,
    });

    expect(createGizmo).toHaveBeenCalledWith(
      camera,
      renderer,
      expect.objectContaining({
        type: 'cube',
        size: 90,
        placement: 'bottom-right',
        container,
        front: expect.objectContaining({ labelColor: '#409eff' }),
        back: expect.objectContaining({ labelColor: '#409eff' }),
      }),
    );
    expect(gizmo.attachControls).toHaveBeenCalledWith(controls);

    gizmo.dispatchEvent({ type: 'change' });
    expect(invalidate).toHaveBeenCalled();
    system.resize();
    expect(gizmo.update).toHaveBeenCalledOnce();

    gizmo.animating = true;
    expect(system.render()).toBe(true);
    expect(gizmo.render).toHaveBeenCalledOnce();

    system.dispose();
    expect(gizmo.dispose).toHaveBeenCalledOnce();
  });
});
