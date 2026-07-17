import type { RuntimeNodeEvent } from '@digital-twin/runtime-core';
import { Raycaster, Vector2, type Camera, type Object3D } from 'three';

interface OrbitEventSource {
  addEventListener(type: 'change', listener: () => void): void;
  removeEventListener(type: 'change', listener: () => void): void;
}

export interface RuntimePointerSystemOptions {
  camera: Camera;
  canvas: HTMLElement;
  root: Object3D;
  getNodeId(object: Object3D): string | undefined;
  orbitControls?: OrbitEventSource;
}

type PointerListener = () => void;

/** 将 canvas 相对射线命中统一转换成稳定 SceneNode ID 事件。 */
export class RuntimePointerSystem {
  private readonly raycaster = new Raycaster();
  private readonly pointer = new Vector2();
  private readonly listeners = new Map<
    RuntimeNodeEvent,
    Map<string, Set<PointerListener>>
  >();
  private pointerDown?: { x: number; y: number };
  private orbitChanged = false;
  private hoveredNodeId?: string;
  private enabled = true;

  constructor(private readonly options: RuntimePointerSystemOptions) {
    options.canvas.addEventListener('pointerdown', this.onPointerDown);
    options.canvas.addEventListener('pointerup', this.onPointerUp);
    options.canvas.addEventListener('pointermove', this.onPointerMove);
    options.canvas.addEventListener('pointerleave', this.onPointerLeave);
    options.canvas.addEventListener('dblclick', this.onDoubleClick);
    options.orbitControls?.addEventListener('change', this.onOrbitChange);
  }

  subscribe(
    nodeId: string,
    event: RuntimeNodeEvent,
    listener: PointerListener,
  ): () => void {
    const byNode = this.listeners.get(event) ?? new Map();
    const nodeListeners = byNode.get(nodeId) ?? new Set();
    nodeListeners.add(listener);
    byNode.set(nodeId, nodeListeners);
    this.listeners.set(event, byNode);
    return () => {
      nodeListeners.delete(listener);
      if (nodeListeners.size === 0) byNode.delete(nodeId);
      if (byNode.size === 0) this.listeners.delete(event);
    };
  }

  /** 第一人称或漫游独占 Camera 时，暂停业务 hover/click，避免中心准星误触。 */
  setEnabled(enabled: boolean): void {
    if (this.enabled === enabled) return;
    this.enabled = enabled;
    this.pointerDown = undefined;
    if (!enabled) {
      this.dispatch('pointer-leave', this.hoveredNodeId);
      this.hoveredNodeId = undefined;
    }
  }

  pickAt(clientX: number, clientY: number): string | undefined {
    if (!this.enabled) return undefined;
    const rect = this.options.canvas.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return undefined;
    this.pointer.set(
      ((clientX - rect.left) / rect.width) * 2 - 1,
      -((clientY - rect.top) / rect.height) * 2 + 1,
    );
    this.raycaster.setFromCamera(this.pointer, this.options.camera);
    const hit = this.raycaster.intersectObject(this.options.root, true)[0];
    return hit ? this.options.getNodeId(hit.object) : undefined;
  }

  dispose(): void {
    this.options.canvas.removeEventListener('pointerdown', this.onPointerDown);
    this.options.canvas.removeEventListener('pointerup', this.onPointerUp);
    this.options.canvas.removeEventListener('pointermove', this.onPointerMove);
    this.options.canvas.removeEventListener(
      'pointerleave',
      this.onPointerLeave,
    );
    this.options.canvas.removeEventListener('dblclick', this.onDoubleClick);
    this.options.orbitControls?.removeEventListener(
      'change',
      this.onOrbitChange,
    );
    this.listeners.clear();
    this.pointerDown = undefined;
    this.hoveredNodeId = undefined;
  }

  private dispatch(event: RuntimeNodeEvent, nodeId: string | undefined): void {
    if (!nodeId) return;
    for (const listener of this.listeners.get(event)?.get(nodeId) ?? []) {
      listener();
    }
  }

  private readonly onPointerDown = (event: PointerEvent): void => {
    if (!this.enabled || event.button !== 0) return;
    this.pointerDown = { x: event.clientX, y: event.clientY };
    this.orbitChanged = false;
  };

  private readonly onPointerUp = (event: PointerEvent): void => {
    if (!this.enabled) return;
    const start = this.pointerDown;
    this.pointerDown = undefined;
    if (!start || event.button !== 0 || this.orbitChanged) return;
    if (Math.hypot(event.clientX - start.x, event.clientY - start.y) > 5) {
      return;
    }
    this.dispatch('click', this.pickAt(event.clientX, event.clientY));
  };

  private readonly onDoubleClick = (event: MouseEvent): void => {
    if (!this.enabled) return;
    this.dispatch('double-click', this.pickAt(event.clientX, event.clientY));
  };

  private readonly onPointerMove = (event: PointerEvent): void => {
    if (!this.enabled || this.pointerDown) return;
    const next = this.pickAt(event.clientX, event.clientY);
    if (next === this.hoveredNodeId) return;
    this.dispatch('pointer-leave', this.hoveredNodeId);
    this.hoveredNodeId = next;
    this.dispatch('pointer-enter', next);
  };

  private readonly onPointerLeave = (): void => {
    this.dispatch('pointer-leave', this.hoveredNodeId);
    this.hoveredNodeId = undefined;
  };

  private readonly onOrbitChange = (): void => {
    if (this.pointerDown) this.orbitChanged = true;
  };
}
