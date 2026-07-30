import type { Camera, Scene } from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { CSS3DRenderer } from 'three/addons/renderers/CSS3DRenderer.js';
import {
  configureOrbitControls,
  type OrbitControlsLike,
} from '../interaction/OrbitControlsProfile.js';

export interface LinkedOrbitControls extends OrbitControlsLike {
  enabled: boolean;
  addEventListener(type: 'change', listener: () => void): void;
  removeEventListener(type: 'change', listener: () => void): void;
  dispose(): void;
}

export interface Css3DRendererLike {
  domElement: HTMLElement;
  setSize(width: number, height: number): void;
  render(scene: Scene, camera: Camera): void;
}

export interface Css3DOverlaySystemOptions {
  scene: Scene;
  camera: Camera;
  container: HTMLElement;
  primaryControls: LinkedOrbitControls;
  invalidate?(): void;
  onSelect?(nodeId: string, additive: boolean): void;
  onDoubleClick?(nodeId: string): void;
  createRenderer?(): Css3DRendererLike;
  createControls?(camera: Camera, element: HTMLElement): LinkedOrbitControls;
}

/**
 * CSS3DRenderer 与 WebGLRenderer 共享 Scene/Camera。独立 OrbitControls 只处理鼠标
 * 位于图表 DOM 上的手势，并与主控制器同步 target，避免跨越图表边界时视角跳变。
 */
export class Css3DOverlaySystem {
  private readonly renderer: Css3DRendererLike;
  private readonly controls: LinkedOrbitControls;
  private syncing = false;
  private pointerStart?: { x: number; y: number };
  private disposed = false;

  constructor(private readonly options: Css3DOverlaySystemOptions) {
    this.renderer = options.createRenderer?.() ?? new CSS3DRenderer();
    const element = this.renderer.domElement;
    element.className = 'css3d-renderer';
    element.style.position = 'absolute';
    element.style.inset = '0';
    element.style.zIndex = '1';
    element.style.pointerEvents = 'none';
    options.container.append(element);

    this.controls =
      options.createControls?.(options.camera, element) ??
      (new OrbitControls(
        options.camera,
        element,
      ) as unknown as LinkedOrbitControls);
    configureOrbitControls(this.controls, { enablePan: true });
    this.controls.target.copy(options.primaryControls.target);
    this.controls.update();
    this.controls.addEventListener('change', this.onOverlayControlsChange);
    options.primaryControls.addEventListener(
      'change',
      this.onPrimaryControlsChange,
    );
    element.addEventListener('pointerdown', this.onPointerDown);
    element.addEventListener('pointerup', this.onPointerUp);
    element.addEventListener('pointerleave', this.onPointerLeave);
    element.addEventListener('dblclick', this.onDoubleClick);
  }

  resize(width: number, height: number): void {
    if (this.disposed || width <= 0 || height <= 0) return;
    this.renderer.setSize(width, height);
  }

  render(): void {
    if (this.disposed) return;
    this.controls.enabled = this.options.primaryControls.enabled;
    this.renderer.render(this.options.scene, this.options.camera);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.controls.removeEventListener('change', this.onOverlayControlsChange);
    this.options.primaryControls.removeEventListener(
      'change',
      this.onPrimaryControlsChange,
    );
    const element = this.renderer.domElement;
    element.removeEventListener('pointerdown', this.onPointerDown);
    element.removeEventListener('pointerup', this.onPointerUp);
    element.removeEventListener('pointerleave', this.onPointerLeave);
    element.removeEventListener('dblclick', this.onDoubleClick);
    this.controls.dispose();
    element.remove();
    this.pointerStart = undefined;
  }

  private nodeIdOf(target: EventTarget | null): string | undefined {
    if (!(target instanceof Element)) return undefined;
    return (
      target.closest<HTMLElement>('[data-scene-node-id]')?.dataset
        .sceneNodeId || undefined
    );
  }

  private readonly onPrimaryControlsChange = (): void => {
    if (this.syncing || this.disposed) return;
    this.syncing = true;
    this.controls.target.copy(this.options.primaryControls.target);
    this.controls.update();
    this.syncing = false;
  };

  private readonly onOverlayControlsChange = (): void => {
    if (this.syncing || this.disposed) return;
    this.syncing = true;
    this.options.primaryControls.target.copy(this.controls.target);
    this.options.primaryControls.update();
    this.syncing = false;
    this.options.invalidate?.();
  };

  private readonly onPointerDown = (event: PointerEvent): void => {
    if (event.button !== 0 || !this.nodeIdOf(event.target)) return;
    this.pointerStart = { x: event.clientX, y: event.clientY };
  };

  private readonly onPointerUp = (event: PointerEvent): void => {
    const start = this.pointerStart;
    this.pointerStart = undefined;
    const nodeId = this.nodeIdOf(event.target);
    if (!start || !nodeId || event.button !== 0) return;
    if (Math.hypot(event.clientX - start.x, event.clientY - start.y) > 5) {
      return;
    }
    this.options.onSelect?.(nodeId, event.ctrlKey || event.metaKey);
  };

  private readonly onPointerLeave = (): void => {
    this.pointerStart = undefined;
  };

  private readonly onDoubleClick = (event: MouseEvent): void => {
    const nodeId = this.nodeIdOf(event.target);
    if (nodeId) this.options.onDoubleClick?.(nodeId);
  };
}
