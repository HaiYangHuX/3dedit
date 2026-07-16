import type { Transform } from '@digital-twin/scene-schema';
import type { Camera, Object3D, Scene } from 'three';
import {
  TransformControls,
  type TransformControlsMode,
} from 'three/addons/controls/TransformControls.js';

export interface TransformCommit {
  nodeId: string;
  before: Transform;
  after: Transform;
}

export interface TransformSystemOptions {
  scene: Scene;
  camera: Camera;
  canvas: HTMLElement;
  getObject(nodeId: string): Object3D | undefined;
  onChange?(): void;
  onTransformStart?(nodeId: string, before: Transform): void;
  onTransformChange?(nodeId: string, transform: Transform): void;
  onTransformEnd?(commit: TransformCommit): void;
  onDraggingChange?(dragging: boolean): void;
}

function snapshot(object: Object3D): Transform {
  return {
    position: [object.position.x, object.position.y, object.position.z],
    rotation: [object.rotation.x, object.rotation.y, object.rotation.z],
    scale: [object.scale.x, object.scale.y, object.scale.z],
  };
}

function transformEquals(left: Transform, right: Transform): boolean {
  return (
    left.position.every((value, index) => value === right.position[index]) &&
    left.rotation.every((value, index) => value === right.rotation[index]) &&
    left.scale.every((value, index) => value === right.scale[index])
  );
}

/**
 * 包装 Three.js r183 TransformControls，将高频 objectChange 和一次性命令提交分开。
 * 这样 Store 可以实时更新面板，但撤销栈只会记录一次完整拖拽。
 */
export class TransformSystem {
  readonly controls: TransformControls;
  private readonly helper: Object3D;
  private attachedNodeId: string | null = null;
  private before: Transform | null = null;

  constructor(private readonly options: TransformSystemOptions) {
    this.controls = new TransformControls(options.camera, options.canvas);
    this.helper = this.controls.getHelper();
    this.helper.userData.editorHelper = true;
    options.scene.add(this.helper);
    this.controls.addEventListener('change', this.handleChange);
    this.controls.addEventListener('mouseDown', this.handleMouseDown);
    this.controls.addEventListener('objectChange', this.handleObjectChange);
    this.controls.addEventListener('mouseUp', this.handleMouseUp);
  }

  setSelection(primaryId: string | null): void {
    const object = primaryId ? this.options.getObject(primaryId) : undefined;
    if (!object || object.userData.locked === true) {
      this.attachedNodeId = null;
      this.before = null;
      this.controls.detach();
      return;
    }
    this.attachedNodeId = primaryId;
    this.before = null;
    this.controls.attach(object);
  }

  setMode(mode: TransformControlsMode): void {
    this.controls.setMode(mode);
  }

  setSpace(space: 'local' | 'world'): void {
    this.controls.setSpace(space);
  }

  setSnap(gridSize: number | null): void {
    const enabled = gridSize !== null && gridSize > 0;
    this.controls.setTranslationSnap(enabled ? gridSize : null);
    this.controls.setRotationSnap(enabled ? Math.PI / 12 : null);
    this.controls.setScaleSnap(enabled ? gridSize : null);
  }

  /** 返回是否消费了 W/E/R 工具快捷键。 */
  handleShortcut(code: string): boolean {
    const modeByCode: Partial<Record<string, TransformControlsMode>> = {
      KeyW: 'translate',
      KeyE: 'rotate',
      KeyR: 'scale',
    };
    const mode = modeByCode[code];
    if (!mode) return false;
    this.setMode(mode);
    return true;
  }

  get isDragging(): boolean {
    return this.controls.dragging || this.before !== null;
  }

  dispose(): void {
    this.controls.removeEventListener('change', this.handleChange);
    this.controls.removeEventListener('mouseDown', this.handleMouseDown);
    this.controls.removeEventListener('objectChange', this.handleObjectChange);
    this.controls.removeEventListener('mouseUp', this.handleMouseUp);
    this.controls.detach();
    this.helper.removeFromParent();
    this.controls.dispose();
    this.attachedNodeId = null;
    this.before = null;
  }

  private readonly handleChange = (): void => {
    // 手柄高亮和模式切换也会触发 change，渲染层需要立即刷新。
    this.options.onChange?.();
  };

  private readonly handleMouseDown = (): void => {
    const object = this.controls.object;
    if (!this.attachedNodeId || !object || object.userData.locked === true) {
      return;
    }
    this.before = snapshot(object);
    this.options.onDraggingChange?.(true);
    this.options.onTransformStart?.(this.attachedNodeId, this.before);
  };

  private readonly handleObjectChange = (): void => {
    const object = this.controls.object;
    if (!this.attachedNodeId || !object) return;
    this.options.onTransformChange?.(this.attachedNodeId, snapshot(object));
  };

  private readonly handleMouseUp = (): void => {
    const before = this.before;
    const object = this.controls.object;
    const nodeId = this.attachedNodeId;
    // 先清空交易，避免浏览器或测试环境重复派发 mouseUp 造成双重命令。
    this.before = null;
    this.options.onDraggingChange?.(false);
    if (!before || !object || !nodeId) return;
    const after = snapshot(object);
    if (!transformEquals(before, after)) {
      this.options.onTransformEnd?.({ nodeId, before, after });
    }
  };
}
