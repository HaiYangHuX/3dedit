import { Raycaster, Vector2, type Camera, type Object3D } from 'three';

export interface SelectionState {
  ids: string[];
  primaryId: string | null;
}

export interface SelectionHighlightTarget {
  setObjects(objects: Object3D[]): void;
  clear(): void;
}

export interface SelectionSystemOptions {
  camera: Camera;
  canvas: HTMLElement;
  root: Object3D;
  getNodeId(object: Object3D): string | undefined;
  getObject(nodeId: string): Object3D | undefined;
  highlight: SelectionHighlightTarget;
  onSelectionChange?(selection: SelectionState): void;
  onDoubleClick?(nodeId: string): void;
  clickTolerance?: number;
}

interface PointerStart {
  x: number;
  y: number;
}

interface SelectionHit {
  nodeId: string;
  hitObject: Object3D;
}

/**
 * 统一处理视口拾取、多选语义与编辑辅助高亮同步。
 * 射线只遍历文档根节点，网格、变换手柄等编辑器辅助物不会进入业务选择。
 */
export class SelectionSystem {
  private readonly raycaster = new Raycaster();
  private readonly pointer = new Vector2();
  private readonly selectedIds: string[] = [];
  private readonly pickedObjects = new Map<string, Object3D>();
  private highlightedObjects: Object3D[] = [];
  private primaryId: string | null = null;
  private pointerStart?: PointerStart;
  private suppressPointerUp = false;
  private enabled = true;
  private selectWholeModel = true;

  constructor(private readonly options: SelectionSystemOptions) {
    options.canvas.addEventListener('pointerdown', this.handlePointerDown);
    options.canvas.addEventListener('pointerup', this.handlePointerUp);
    options.canvas.addEventListener('dblclick', this.handleDoubleClick);
  }

  getSelection(): SelectionState {
    return { ids: [...this.selectedIds], primaryId: this.primaryId };
  }

  /** 第一人称和测量模式接管画布点击时，暂时停用普通节点拾取。 */
  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    if (!enabled) {
      this.pointerStart = undefined;
    }
  }

  /**
   * 关闭整模模式时只改变黄色包围盒目标，业务选择仍保持 SceneNode ID，
   * 从而确保属性、删除和撤销命令不会收到瞬时 Object3D UUID。
   */
  setSelectWholeModel(enabled: boolean): void {
    if (this.selectWholeModel === enabled) return;
    this.selectWholeModel = enabled;
    if (enabled) this.pickedObjects.clear();
    this.refreshHighlight(this.selectedIds);
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
    // 场景树等外部入口没有 Mesh 命中信息，统一恢复业务根高亮。
    this.pickedObjects.clear();
    this.commitSelection(nextIds, nextPrimary);
  }

  /**
   * TransformControls 开始拖拽后，同一次 pointerup 不应穿透给场景拾取。
   */
  suppressNextPointerUp(): void {
    this.suppressPointerUp = true;
  }

  selectAt(clientX: number, clientY: number, additive = false): void {
    const hit = this.pick(clientX, clientY);
    if (!hit) {
      if (!additive) this.commitSelection([], null);
      return;
    }
    const { nodeId, hitObject } = hit;

    if (!additive) {
      this.pickedObjects.clear();
      if (!this.selectWholeModel) this.pickedObjects.set(nodeId, hitObject);
      this.commitSelection([nodeId], nodeId);
      return;
    }

    const nextIds = [...this.selectedIds];
    const index = nextIds.indexOf(nodeId);
    if (index >= 0) {
      nextIds.splice(index, 1);
      this.pickedObjects.delete(nodeId);
      this.commitSelection(nextIds, nextIds.at(-1) ?? null);
      return;
    }
    nextIds.push(nodeId);
    if (!this.selectWholeModel) this.pickedObjects.set(nodeId, hitObject);
    this.commitSelection(nextIds, nodeId);
  }

  dispose(): void {
    this.options.canvas.removeEventListener(
      'pointerdown',
      this.handlePointerDown,
    );
    this.options.canvas.removeEventListener('pointerup', this.handlePointerUp);
    this.options.canvas.removeEventListener('dblclick', this.handleDoubleClick);
    this.selectedIds.length = 0;
    this.pickedObjects.clear();
    this.highlightedObjects = [];
    this.options.highlight.clear();
    this.enabled = false;
  }

  private pick(clientX: number, clientY: number): SelectionHit | undefined {
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
      if (nodeId && this.options.getObject(nodeId)) {
        return { nodeId, hitObject: hit.object };
      }
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
    this.refreshHighlight(ids);
    if (unchanged) return;

    this.selectedIds.splice(0, this.selectedIds.length, ...ids);
    this.primaryId = primaryId;
    this.options.onSelectionChange?.(this.getSelection());
  }

  private readonly handlePointerDown = (event: PointerEvent): void => {
    if (!this.enabled || event.button !== 0) return;
    this.pointerStart = { x: event.clientX, y: event.clientY };
  };

  private readonly handlePointerUp = (event: PointerEvent): void => {
    if (!this.enabled) return;
    const start = this.pointerStart;
    this.pointerStart = undefined;
    const suppressed = this.suppressPointerUp;
    this.suppressPointerUp = false;
    if (!start || event.button !== 0) return;

    const tolerance = this.options.clickTolerance ?? 5;
    const moved =
      Math.hypot(event.clientX - start.x, event.clientY - start.y) > tolerance;
    // OrbitControls 会在极小手抖时派发 change；源站只以 5px 位移判定点击。
    if (suppressed || moved) return;
    this.selectAt(event.clientX, event.clientY, event.ctrlKey || event.metaKey);
  };

  private readonly handleDoubleClick = (event: MouseEvent): void => {
    if (!this.enabled) return;
    const hit = this.pick(event.clientX, event.clientY);
    if (!hit) return;
    // 双击先同步业务选择，再让宿主将相机过渡到当前模型，匹配源站“F/双击材质”语义。
    this.selectAt(event.clientX, event.clientY, event.ctrlKey || event.metaKey);
    this.options.onDoubleClick?.(hit.nodeId);
  };

  private refreshHighlight(ids: readonly string[]): void {
    const objects = ids.flatMap((id) => {
      const object =
        (!this.selectWholeModel && this.pickedObjects.get(id)) ||
        this.options.getObject(id);
      return object ? [object] : [];
    });
    const unchanged =
      objects.length === this.highlightedObjects.length &&
      objects.every(
        (object, index) => object === this.highlightedObjects[index],
      );
    if (unchanged) return;

    // ID 未变但模型重新加载时，Object3D 引用会变化，此时仍需重建 BoxHelper。
    this.options.highlight.setObjects(objects);
    this.highlightedObjects = [...objects];
  }
}
