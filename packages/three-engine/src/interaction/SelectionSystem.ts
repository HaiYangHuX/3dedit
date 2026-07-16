import { Raycaster, Vector2, type Camera, type Object3D } from 'three';

export interface SelectionState {
  ids: string[];
  primaryId: string | null;
}

export interface OutlineSelectionTarget {
  selectedObjects: Object3D[];
}

interface OrbitControlsEventSource {
  addEventListener(type: 'change', listener: (event: unknown) => void): void;
  removeEventListener(type: 'change', listener: (event: unknown) => void): void;
}

export interface SelectionSystemOptions {
  camera: Camera;
  canvas: HTMLElement;
  root: Object3D;
  getNodeId(object: Object3D): string | undefined;
  getObject(nodeId: string): Object3D | undefined;
  outline: OutlineSelectionTarget;
  orbitControls?: OrbitControlsEventSource;
  onSelectionChange?(selection: SelectionState): void;
  clickTolerance?: number;
}

interface PointerStart {
  x: number;
  y: number;
}

/**
 * 统一处理视口拾取、多选语义与 OutlinePass 同步。
 * 射线只遍历文档根节点，网格、变换手柄等编辑器辅助物不会进入业务选择。
 */
export class SelectionSystem {
  private readonly raycaster = new Raycaster();
  private readonly pointer = new Vector2();
  private readonly selectedIds: string[] = [];
  private primaryId: string | null = null;
  private pointerStart?: PointerStart;
  private orbitChangedSincePointerDown = false;
  private suppressPointerUp = false;

  constructor(private readonly options: SelectionSystemOptions) {
    options.canvas.addEventListener('pointerdown', this.handlePointerDown);
    options.canvas.addEventListener('pointerup', this.handlePointerUp);
    options.orbitControls?.addEventListener('change', this.handleOrbitChange);
  }

  getSelection(): SelectionState {
    return { ids: [...this.selectedIds], primaryId: this.primaryId };
  }

  /** 由文档 Store 或场景树反向同步选中状态。 */
  setSelection(ids: Iterable<string>, primaryId?: string | null): void {
    const nextIds = [...new Set(ids)].filter((id) =>
      Boolean(this.options.getObject(id)),
    );
    const nextPrimary =
      primaryId && nextIds.includes(primaryId)
        ? primaryId
        : (nextIds.at(-1) ?? null);
    this.commitSelection(nextIds, nextPrimary);
  }

  /**
   * TransformControls 开始拖拽后，同一次 pointerup 不应穿透给场景拾取。
   */
  suppressNextPointerUp(): void {
    this.suppressPointerUp = true;
  }

  selectAt(clientX: number, clientY: number, additive = false): void {
    const nodeId = this.pickNodeId(clientX, clientY);
    if (!nodeId) {
      if (!additive) this.commitSelection([], null);
      return;
    }

    if (!additive) {
      this.commitSelection([nodeId], nodeId);
      return;
    }

    const nextIds = [...this.selectedIds];
    const index = nextIds.indexOf(nodeId);
    if (index >= 0) {
      nextIds.splice(index, 1);
      this.commitSelection(nextIds, nextIds.at(-1) ?? null);
      return;
    }
    nextIds.push(nodeId);
    this.commitSelection(nextIds, nodeId);
  }

  dispose(): void {
    this.options.canvas.removeEventListener(
      'pointerdown',
      this.handlePointerDown,
    );
    this.options.canvas.removeEventListener('pointerup', this.handlePointerUp);
    this.options.orbitControls?.removeEventListener(
      'change',
      this.handleOrbitChange,
    );
    this.selectedIds.length = 0;
    this.options.outline.selectedObjects = [];
  }

  private pickNodeId(clientX: number, clientY: number): string | undefined {
    const rect = this.options.canvas.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return undefined;
    this.pointer.set(
      ((clientX - rect.left) / rect.width) * 2 - 1,
      -((clientY - rect.top) / rect.height) * 2 + 1,
    );
    this.raycaster.setFromCamera(this.pointer, this.options.camera);

    for (const hit of this.raycaster.intersectObject(this.options.root, true)) {
      if (!this.isEffectivelyVisible(hit.object)) continue;
      const nodeId = this.options.getNodeId(hit.object);
      if (nodeId && this.options.getObject(nodeId)) return nodeId;
    }
    return undefined;
  }

  private isEffectivelyVisible(object: Object3D): boolean {
    let current: Object3D | null = object;
    while (current) {
      if (!current.visible) return false;
      if (current === this.options.root) break;
      current = current.parent;
    }
    return true;
  }

  private commitSelection(ids: string[], primaryId: string | null): void {
    const unchanged =
      this.primaryId === primaryId &&
      this.selectedIds.length === ids.length &&
      this.selectedIds.every((id, index) => id === ids[index]);
    if (unchanged) return;

    this.selectedIds.splice(0, this.selectedIds.length, ...ids);
    this.primaryId = primaryId;
    // OutlinePass 接收业务根对象，不将内部 Mesh 泄漏给上层。
    this.options.outline.selectedObjects = ids.flatMap((id) => {
      const object = this.options.getObject(id);
      return object ? [object] : [];
    });
    this.options.onSelectionChange?.(this.getSelection());
  }

  private readonly handlePointerDown = (event: PointerEvent): void => {
    if (event.button !== 0) return;
    this.pointerStart = { x: event.clientX, y: event.clientY };
    this.orbitChangedSincePointerDown = false;
  };

  private readonly handlePointerUp = (event: PointerEvent): void => {
    const start = this.pointerStart;
    this.pointerStart = undefined;
    const suppressed = this.suppressPointerUp;
    this.suppressPointerUp = false;
    if (!start || event.button !== 0) return;

    const tolerance = this.options.clickTolerance ?? 4;
    const moved =
      Math.hypot(event.clientX - start.x, event.clientY - start.y) > tolerance;
    if (suppressed || moved || this.orbitChangedSincePointerDown) return;
    this.selectAt(event.clientX, event.clientY, event.ctrlKey || event.metaKey);
  };

  private readonly handleOrbitChange = (): void => {
    if (this.pointerStart) this.orbitChangedSincePointerDown = true;
  };
}
