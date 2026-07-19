import {
  BufferGeometry,
  CanvasTexture,
  Group,
  Line,
  LineDashedMaterial,
  Raycaster,
  Sprite,
  SpriteMaterial,
  Vector2,
} from 'three';
import type { Camera, Object3D, Scene, Vector3 } from 'three';

export interface MeasurementSystemOptions {
  scene: Scene;
  root: Object3D;
  camera: Camera;
  canvas: HTMLElement;
  onStateChange?(active: boolean): void;
  onChange?(): void;
}

/** 数字孪生 以 10 个世界单位代表 1 米，并固定显示两位小数。 */
export function formatMeasurementDistance(worldDistance: number): string {
  return `${(Math.max(worldDistance, 0) / 10).toFixed(2)}m`;
}

interface PointerPosition {
  x: number;
  y: number;
}

/**
 * 负责源站测量模式的两点拾取和临时标注层。
 * 已完成的测量线会保留到下一次清理，进入测量模式只重置当前待选点。
 */
export class MeasurementSystem {
  readonly layer = new Group();
  private readonly raycaster = new Raycaster();
  private readonly pointer = new Vector2();
  private isMeasuring = false;
  private pointerDown?: PointerPosition;
  private startPoint?: Vector3;

  constructor(private readonly options: MeasurementSystemOptions) {
    this.layer.name = '__measurement_helpers__';
    this.layer.userData.isEditorHelper = true;
    options.scene.add(this.layer);
    options.canvas.addEventListener('pointerdown', this.handlePointerDown);
    options.canvas.addEventListener('pointerup', this.handlePointerUp);
  }

  get active(): boolean {
    return this.isMeasuring;
  }

  start(): void {
    if (this.isMeasuring) return;
    this.isMeasuring = true;
    this.startPoint = undefined;
    this.options.canvas.style.cursor = 'crosshair';
    this.options.onStateChange?.(true);
    this.options.onChange?.();
  }

  end(): void {
    if (!this.isMeasuring && !this.startPoint) return;
    this.isMeasuring = false;
    this.startPoint = undefined;
    this.options.canvas.style.cursor = '';
    this.options.onStateChange?.(false);
    this.options.onChange?.();
  }

  toggle(): boolean {
    if (this.isMeasuring) this.end();
    else this.start();
    return this.isMeasuring;
  }

  clear(): void {
    while (this.layer.children.length > 0) {
      const child = this.layer.children[0];
      if (!child) continue;
      this.layer.remove(child);
      disposeMeasurementObject(child);
    }
    this.options.onChange?.();
  }

  dispose(): void {
    this.options.canvas.removeEventListener(
      'pointerdown',
      this.handlePointerDown,
    );
    this.options.canvas.removeEventListener('pointerup', this.handlePointerUp);
    this.clear();
    this.options.scene.remove(this.layer);
    this.isMeasuring = false;
    this.startPoint = undefined;
  }

  private readonly handlePointerDown = (event: PointerEvent): void => {
    if (!this.isMeasuring || event.button !== 0) return;
    this.pointerDown = { x: event.clientX, y: event.clientY };
  };

  private readonly handlePointerUp = (event: PointerEvent): void => {
    const pointerDown = this.pointerDown;
    this.pointerDown = undefined;
    if (!this.isMeasuring || event.button !== 0 || !pointerDown) return;
    if (
      Math.hypot(event.clientX - pointerDown.x, event.clientY - pointerDown.y) >
      5
    ) {
      return;
    }

    const point = this.pickPoint(event.clientX, event.clientY);
    if (!point) return;
    if (!this.startPoint) {
      this.startPoint = point;
      return;
    }
    if (point.distanceTo(this.startPoint) < 0.001) return;
    this.drawMeasurement(this.startPoint, point);
    this.startPoint = undefined;
  };

  private pickPoint(clientX: number, clientY: number): Vector3 | undefined {
    const rect = this.options.canvas.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return undefined;
    this.pointer.set(
      ((clientX - rect.left) / rect.width) * 2 - 1,
      -((clientY - rect.top) / rect.height) * 2 + 1,
    );
    this.raycaster.setFromCamera(this.pointer, this.options.camera);
    const hit = this.raycaster
      .intersectObject(this.options.root, true)
      .find((entry) => entry.object.visible);
    return hit?.point.clone();
  }

  private drawMeasurement(start: Vector3, end: Vector3): void {
    const lineGeometry = new BufferGeometry().setFromPoints([start, end]);
    const lineMaterial = new LineDashedMaterial({
      color: '#6d8fe4',
      dashSize: 0.03,
      gapSize: 0.01,
    });
    const line = new Line(lineGeometry, lineMaterial);
    line.computeLineDistances();
    line.userData.isEditorHelper = true;

    const midpoint = start.clone().add(end).multiplyScalar(0.5);
    const label = this.createLabel(
      formatMeasurementDistance(start.distanceTo(end)),
    );
    label.position.set(midpoint.x, midpoint.y + 0.2, midpoint.z);
    label.userData.isEditorHelper = true;

    const measurement = new Group();
    measurement.name = '测量线';
    measurement.userData.isEditorHelper = true;
    measurement.add(line, label);
    this.layer.add(measurement);
    this.options.onChange?.();
  }

  private createLabel(text: string): Sprite {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 256;
    const context = canvas.getContext('2d');
    if (context) {
      context.font = 'normal 50px Arial';
      context.fillStyle = '#fff';
      context.strokeStyle = 'rgba(0, 0, 0, 0.8)';
      context.lineWidth = 1;
      context.textAlign = 'center';
      context.textBaseline = 'middle';
      context.strokeText(text, 128, 128);
      context.fillText(text, 128, 128);
    }
    const texture = new CanvasTexture(canvas);
    texture.needsUpdate = true;
    const material = new SpriteMaterial({
      map: texture,
      transparent: true,
      alphaTest: 0.1,
    });
    const sprite = new Sprite(material);
    sprite.scale.set(0.8, 0.8, 1);
    return sprite;
  }
}

function disposeMeasurementObject(object: Object3D): void {
  object.traverse((child) => {
    if (child instanceof Line) {
      child.geometry.dispose();
      disposeMaterial(child.material);
    } else if (child instanceof Sprite) {
      disposeMaterial(child.material);
    }
  });
}

function disposeMaterial(
  material: LineDashedMaterial | SpriteMaterial | LineDashedMaterial[],
): void {
  const materials = Array.isArray(material) ? material : [material];
  for (const item of materials) {
    item.map?.dispose();
    item.dispose();
  }
}
