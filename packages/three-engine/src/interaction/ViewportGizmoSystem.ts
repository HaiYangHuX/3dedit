import type { EventDispatcher, PerspectiveCamera, WebGLRenderer } from 'three';
import type { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { ViewportGizmo, type GizmoOptions } from 'three-viewport-gizmo';

interface ViewportGizmoEvents {
  start: object;
  change: object;
  end: object;
}

/** 仅暴露 Engine 生命周期真正依赖的 Gizmo 表面，便于无 WebGL 单元测试。 */
export interface ViewportGizmoAdapter {
  animating: boolean;
  attachControls(controls: OrbitControls): unknown;
  update(): unknown;
  render(): unknown;
  dispose(): void;
}

type ViewportGizmoEventTarget = ViewportGizmoAdapter &
  EventDispatcher<ViewportGizmoEvents>;

export interface ViewportGizmoSystemOptions {
  camera: PerspectiveCamera;
  renderer: WebGLRenderer;
  controls: OrbitControls;
  container: HTMLElement;
  invalidate(): void;
  createGizmo?(
    camera: PerspectiveCamera,
    renderer: WebGLRenderer,
    options: GizmoOptions,
  ): ViewportGizmoEventTarget;
}

const SOURCE_GIZMO_OPTIONS = {
  size: 90,
  placement: 'bottom-right',
  type: 'cube',
  offset: { right: 10, bottom: 10 },
  id: 'editor-viewport-gizmo',
  className: 'editor-viewport-gizmo',
  front: {
    enabled: true,
    label: '前',
    labelColor: '#409eff',
    opacity: 1,
  },
  back: {
    enabled: true,
    label: '后',
    labelColor: '#409eff',
    opacity: 1,
  },
  font: { family: 'helvetica', weight: 300 },
} satisfies GizmoOptions;

/**
 * 把第三方视角 Gizmo 纳入 EditorEngine 的渲染、resize 和 dispose 所有权。
 * Gizmo 自己管理面/边/角拾取与拖拽，本系统只负责与 OrbitControls 同步。
 */
export class ViewportGizmoSystem {
  private readonly gizmo: ViewportGizmoEventTarget;
  private disposed = false;

  constructor(private readonly options: ViewportGizmoSystemOptions) {
    const createGizmo =
      options.createGizmo ??
      ((camera, renderer, gizmoOptions) =>
        new ViewportGizmo(
          camera,
          renderer,
          gizmoOptions,
        ) as ViewportGizmoEventTarget);
    this.gizmo = createGizmo(options.camera, options.renderer, {
      ...SOURCE_GIZMO_OPTIONS,
      container: options.container,
    });
    this.gizmo.attachControls(options.controls);
    this.gizmo.addEventListener('start', this.handleChange);
    this.gizmo.addEventListener('change', this.handleChange);
    this.gizmo.addEventListener('end', this.handleChange);
  }

  get animating(): boolean {
    return !this.disposed && this.gizmo.animating;
  }

  resize(): void {
    if (!this.disposed) this.gizmo.update();
  }

  /** 主场景 composer 完成后调用，返回值用于保持动画期间持续渲染。 */
  render(): boolean {
    if (this.disposed) return false;
    this.gizmo.render();
    return this.gizmo.animating;
  }

  dispose(): void {
    if (this.disposed) return;
    this.gizmo.removeEventListener('start', this.handleChange);
    this.gizmo.removeEventListener('change', this.handleChange);
    this.gizmo.removeEventListener('end', this.handleChange);
    this.gizmo.dispose();
    this.disposed = true;
  }

  private readonly handleChange = (): void => {
    this.options.invalidate();
  };
}
