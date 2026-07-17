import type { CameraRoamingPath } from '@digital-twin/scene-schema';
import {
  BufferGeometry,
  CanvasTexture,
  ConeGeometry,
  CylinderGeometry,
  Group,
  Line,
  LineDashedMaterial,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  Plane,
  Quaternion,
  Raycaster,
  SphereGeometry,
  Sprite,
  SpriteMaterial,
  TorusGeometry,
  Vector2,
  Vector3,
  type Material,
  type Object3D,
  type PerspectiveCamera,
  type Scene,
  type Texture,
} from 'three';

const MAX_CLICK_TIME = 250;
const MAX_CLICK_DISTANCE = 5;
const ROAM_SPEED = 4;
const CAMERA_HEIGHT = 2;
const MIN_SEGMENT_DURATION = 0.4;
const TURN_START = 0.8;
const EPSILON = 1e-6;

export type CameraRoamingMode = 'idle' | 'drawing' | 'previewing';

export interface CameraRoamingState {
  mode: CameraRoamingMode;
  pointCount: number;
  activePathId: string | null;
}

export interface CameraRoamingControls {
  enabled: boolean;
}

export interface CameraRoamingSystemOptions {
  scene: Scene;
  camera: PerspectiveCamera;
  canvas: HTMLElement;
  controls: CameraRoamingControls;
  invalidate(): void;
  onStateChange?(state: CameraRoamingState): void;
  onPathCreated?(pathPoints: Array<[number, number, number]>): void;
  keyboardTarget?: EventTarget;
  now?(): number;
  projectPoint?(clientX: number, clientY: number): Vector3 | undefined;
}

interface PointerStart {
  x: number;
  y: number;
  time: number;
}

/**
 * 编辑器与 Runtime 共用的 Camera 漫游状态机。
 * 绘制、播放、事件监听和临时 GPU 资源都由单一实例拥有，切场景时可一次释放。
 */
export class CameraRoamingSystem {
  private mode: CameraRoamingMode = 'idle';
  private activePathId: string | null = null;
  private readonly drawingPoints: Vector3[] = [];
  private playbackPoints: Vector3[] = [];
  private segmentIndex = 0;
  private segmentElapsed = 0;
  private pointerStart?: PointerStart;
  private modifierPressed = false;
  private visualGroup?: Group;
  private controlsWereEnabled = true;
  private drawingListenersAttached = false;
  private disposed = false;
  private readonly raycaster = new Raycaster();
  private readonly pointer = new Vector2();
  private readonly groundPlane = new Plane(new Vector3(0, 1, 0), 0);
  private readonly lookMatrix = new Matrix4();
  private readonly currentQuaternion = new Quaternion();
  private readonly nextQuaternion = new Quaternion();
  private readonly keyboardTarget: EventTarget;

  constructor(private readonly options: CameraRoamingSystemOptions) {
    this.keyboardTarget =
      options.keyboardTarget ??
      (typeof window === 'undefined' ? new EventTarget() : window);
  }

  getState(): CameraRoamingState {
    return {
      mode: this.mode,
      pointCount: this.drawingPoints.length,
      activePathId: this.activePathId,
    };
  }

  startDrawing(): void {
    if (this.disposed) return;
    if (this.mode === 'previewing') this.stopPreview();
    if (this.mode === 'drawing') this.clearDrawingPoints();
    this.mode = 'drawing';
    this.activePathId = null;
    this.modifierPressed = false;
    this.pointerStart = undefined;
    this.attachDrawingListeners();
    this.emitState();
  }

  cancelDrawing(): void {
    if (this.mode !== 'drawing') return;
    this.detachDrawingListeners();
    this.clearDrawingPoints();
    this.modifierPressed = false;
    this.pointerStart = undefined;
    this.mode = 'idle';
    this.emitState();
  }

  preview(path: CameraRoamingPath): boolean {
    if (this.disposed) return false;
    if (this.mode === 'drawing') this.cancelDrawing();
    if (this.mode === 'previewing') this.stopPreview();

    const points = path.pathPoints.map(
      ([x, , z]) => new Vector3(x, CAMERA_HEIGHT, z),
    );
    // 重复点会生成零向量和 NaN quaternion，播放前先按水平距离过滤。
    this.playbackPoints = points.filter(
      (point, index) =>
        index === 0 ||
        point.distanceToSquared(points[index - 1]!) > EPSILON * EPSILON,
    );
    if (this.playbackPoints.length < 2) {
      this.playbackPoints = [];
      return false;
    }

    this.controlsWereEnabled = this.options.controls.enabled;
    this.options.controls.enabled = false;
    this.segmentIndex = 0;
    this.segmentElapsed = 0;
    this.mode = 'previewing';
    this.activePathId = path.id;
    this.options.camera.position.copy(this.playbackPoints[0]!);
    this.options.camera.quaternion.copy(
      this.getLookQuaternion(
        this.playbackPoints[0]!,
        this.playbackPoints[1]!,
        this.currentQuaternion,
      ),
    );
    this.buildVisuals(path.pathPoints.map(([x, y, z]) => new Vector3(x, y, z)));
    this.emitState();
    this.options.invalidate();
    return true;
  }

  stopPreview(): void {
    if (this.mode !== 'previewing') return;
    this.options.controls.enabled = this.controlsWereEnabled;
    this.playbackPoints = [];
    this.segmentIndex = 0;
    this.segmentElapsed = 0;
    this.activePathId = null;
    this.mode = 'idle';
    this.clearVisuals();
    this.emitState();
    this.options.invalidate();
  }

  /** 返回 true 表示本帧修改了 Camera，调用方必须跳过其他相机控制器。 */
  update(deltaSeconds: number): boolean {
    if (this.mode !== 'previewing' || deltaSeconds <= 0) return false;
    let remaining = deltaSeconds;
    let changed = false;

    while (remaining > 0 && this.mode === 'previewing') {
      const start = this.playbackPoints[this.segmentIndex];
      const end = this.playbackPoints[this.segmentIndex + 1];
      if (!start || !end) {
        this.stopPreview();
        break;
      }
      const duration = Math.max(
        start.distanceTo(end) / ROAM_SPEED,
        MIN_SEGMENT_DURATION,
      );
      const step = Math.min(remaining, duration - this.segmentElapsed);
      this.segmentElapsed += step;
      remaining -= step;
      const progress = Math.min(this.segmentElapsed / duration, 1);
      this.options.camera.position.lerpVectors(start, end, progress);
      this.applySegmentOrientation(start, end, progress);
      changed = true;

      if (progress >= 1 - Number.EPSILON) {
        this.options.camera.position.copy(end);
        this.segmentIndex += 1;
        this.segmentElapsed = 0;
        if (this.segmentIndex >= this.playbackPoints.length - 1) {
          this.stopPreview();
        }
      }
    }

    if (changed) this.options.invalidate();
    return changed;
  }

  dispose(): void {
    if (this.disposed) return;
    if (this.mode === 'drawing') this.cancelDrawing();
    if (this.mode === 'previewing') this.stopPreview();
    this.detachDrawingListeners();
    this.clearVisuals();
    this.mode = 'idle';
    this.activePathId = null;
    this.disposed = true;
  }

  private applySegmentOrientation(
    start: Vector3,
    end: Vector3,
    progress: number,
  ): void {
    this.getLookQuaternion(start, end, this.currentQuaternion);
    const following = this.playbackPoints[this.segmentIndex + 2];
    if (!following || progress <= TURN_START) {
      this.options.camera.quaternion.copy(this.currentQuaternion);
      return;
    }
    this.getLookQuaternion(end, following, this.nextQuaternion);
    const normalized = (progress - TURN_START) / (1 - TURN_START);
    const eased =
      normalized < 0.5
        ? 2 * normalized * normalized
        : 1 - Math.pow(-2 * normalized + 2, 2) / 2;
    this.options.camera.quaternion.slerpQuaternions(
      this.currentQuaternion,
      this.nextQuaternion,
      eased,
    );
  }

  private getLookQuaternion(
    position: Vector3,
    target: Vector3,
    result: Quaternion,
  ): Quaternion {
    this.lookMatrix.lookAt(position, target, this.options.camera.up);
    return result.setFromRotationMatrix(this.lookMatrix);
  }

  private attachDrawingListeners(): void {
    if (this.drawingListenersAttached) return;
    this.keyboardTarget.addEventListener(
      'keydown',
      this.handleKeyDown as EventListener,
    );
    this.keyboardTarget.addEventListener(
      'keyup',
      this.handleKeyUp as EventListener,
    );
    this.keyboardTarget.addEventListener('blur', this.handleBlur);
    this.options.canvas.addEventListener('pointerdown', this.handlePointerDown);
    this.options.canvas.addEventListener('pointerup', this.handlePointerUp);
    this.drawingListenersAttached = true;
  }

  private detachDrawingListeners(): void {
    if (!this.drawingListenersAttached) return;
    this.keyboardTarget.removeEventListener(
      'keydown',
      this.handleKeyDown as EventListener,
    );
    this.keyboardTarget.removeEventListener(
      'keyup',
      this.handleKeyUp as EventListener,
    );
    this.keyboardTarget.removeEventListener('blur', this.handleBlur);
    this.options.canvas.removeEventListener(
      'pointerdown',
      this.handlePointerDown,
    );
    this.options.canvas.removeEventListener('pointerup', this.handlePointerUp);
    this.drawingListenersAttached = false;
  }

  private readonly handleKeyDown = (event: KeyboardEvent): void => {
    if (event.key === 'Control' || event.key === 'Meta') {
      this.modifierPressed = true;
      return;
    }
    if (this.modifierPressed) this.finishDrawing();
  };

  private readonly handleKeyUp = (event: KeyboardEvent): void => {
    if (event.key !== 'Control' && event.key !== 'Meta') return;
    this.modifierPressed = false;
    this.finishDrawing();
  };

  private readonly handleBlur = (): void => {
    this.modifierPressed = false;
    this.finishDrawing();
  };

  private readonly handlePointerDown = (event: PointerEvent): void => {
    if (
      this.mode !== 'drawing' ||
      event.button !== 0 ||
      (!this.modifierPressed && !event.ctrlKey && !event.metaKey)
    ) {
      return;
    }
    this.pointerStart = {
      x: event.clientX,
      y: event.clientY,
      time: this.options.now?.() ?? performance.now(),
    };
  };

  private readonly handlePointerUp = (event: PointerEvent): void => {
    const start = this.pointerStart;
    this.pointerStart = undefined;
    if (!start || event.button !== 0 || this.mode !== 'drawing') return;
    const elapsed = (this.options.now?.() ?? performance.now()) - start.time;
    const distance = Math.hypot(
      event.clientX - start.x,
      event.clientY - start.y,
    );
    if (elapsed > MAX_CLICK_TIME || distance > MAX_CLICK_DISTANCE) return;
    const point = this.projectPoint(event.clientX, event.clientY);
    if (!point) return;
    this.drawingPoints.push(point);
    this.buildVisuals(this.drawingPoints);
    this.emitState();
    this.options.invalidate();
  };

  private finishDrawing(): void {
    if (this.mode !== 'drawing') return;
    if (this.drawingPoints.length < 2) {
      // 源站在不足两点时继续绘制；同时显式归零修饰键，避免松键后误定点。
      this.clearDrawingPoints();
      this.emitState();
      return;
    }
    const points = this.drawingPoints.map(
      (point) => point.toArray() as [number, number, number],
    );
    this.detachDrawingListeners();
    this.clearDrawingPoints();
    this.mode = 'idle';
    this.modifierPressed = false;
    this.options.onPathCreated?.(points);
    this.emitState();
  }

  private projectPoint(clientX: number, clientY: number): Vector3 | undefined {
    const injected = this.options.projectPoint?.(clientX, clientY);
    if (injected) return injected.clone();
    const rect = this.options.canvas.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return undefined;
    this.pointer.set(
      ((clientX - rect.left) / rect.width) * 2 - 1,
      -((clientY - rect.top) / rect.height) * 2 + 1,
    );
    this.raycaster.setFromCamera(this.pointer, this.options.camera);
    const result = new Vector3();
    if (!this.raycaster.ray.intersectPlane(this.groundPlane, result)) {
      return undefined;
    }
    const maxDistance = Math.max(this.options.camera.position.length() * 2, 50);
    if (result.distanceTo(this.options.camera.position) > maxDistance) {
      return undefined;
    }
    result.y = Math.max(result.y, 0.5) + 0.05;
    return result;
  }

  private clearDrawingPoints(): void {
    this.drawingPoints.length = 0;
    this.clearVisuals();
    this.options.invalidate();
  }

  private buildVisuals(points: readonly Vector3[]): void {
    this.clearVisuals();
    if (points.length === 0) return;
    const group = new Group();
    group.name = '__camera_roaming_visuals__';
    group.userData.editorHelper = true;
    points.forEach((point, index) =>
      group.add(this.createMarker(point, index)),
    );
    if (points.length >= 2) {
      const geometry = new BufferGeometry().setFromPoints([...points]);
      const material = new LineDashedMaterial({
        color: 0xffb347,
        dashSize: 0.3,
        gapSize: 0.12,
      });
      const line = new Line(geometry, material);
      line.computeLineDistances();
      line.renderOrder = 9;
      line.userData.editorHelper = true;
      group.add(line);
    }
    this.visualGroup = group;
    this.options.scene.add(group);
  }

  private createMarker(point: Vector3, index: number): Group {
    const marker = new Group();
    marker.position.copy(point);
    marker.userData.editorHelper = true;

    const sphere = new Mesh(
      new SphereGeometry(0.1, 16, 8),
      new MeshBasicMaterial({ color: 0xdffcff }),
    );
    sphere.renderOrder = 12;
    marker.add(sphere);

    const ring = new Mesh(
      new TorusGeometry(0.22, 0.018, 8, 64),
      new MeshBasicMaterial({ color: 0x22d3ee }),
    );
    ring.rotation.x = Math.PI / 2;
    ring.renderOrder = 11;
    marker.add(ring);

    const directions = [
      new Vector3(1, 0, 0),
      new Vector3(-1, 0, 0),
      new Vector3(0, 0, 1),
      new Vector3(0, 0, -1),
      new Vector3(0, 1, 0),
    ];
    const colors = [0xfb7185, 0xfb7185, 0x60a5fa, 0x60a5fa, 0x86efac];
    directions.forEach((direction, directionIndex) => {
      marker.add(this.createArrow(direction, colors[directionIndex]!));
    });

    const label = this.createNumberLabel(index + 1);
    if (label) marker.add(label);
    return marker;
  }

  private createArrow(direction: Vector3, color: number): Group {
    const arrow = new Group();
    const shaft = new Mesh(
      new CylinderGeometry(0.012, 0.012, 0.18, 8),
      new MeshBasicMaterial({ color }),
    );
    shaft.position.y = 0.16;
    const head = new Mesh(
      new ConeGeometry(0.045, 0.1, 10),
      new MeshBasicMaterial({ color }),
    );
    head.position.y = 0.3;
    arrow.add(shaft, head);
    arrow.quaternion.setFromUnitVectors(new Vector3(0, 1, 0), direction);
    arrow.renderOrder = 11;
    return arrow;
  }

  private createNumberLabel(number: number): Sprite | undefined {
    if (typeof document === 'undefined') return undefined;
    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 128;
    const context = canvas.getContext('2d');
    if (!context) return undefined;
    context.clearRect(0, 0, 128, 128);
    context.fillStyle = 'rgba(8, 15, 28, 0.85)';
    context.beginPath();
    context.arc(64, 64, 38, 0, Math.PI * 2);
    context.fill();
    context.strokeStyle = '#22d3ee';
    context.lineWidth = 5;
    context.stroke();
    context.fillStyle = '#ffffff';
    context.font = '600 48px sans-serif';
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.fillText(String(number), 64, 66);
    const texture = new CanvasTexture(canvas);
    const sprite = new Sprite(new SpriteMaterial({ map: texture }));
    sprite.position.y = 0.55;
    sprite.scale.set(0.42, 0.42, 1);
    sprite.renderOrder = 13;
    return sprite;
  }

  private clearVisuals(): void {
    const root = this.visualGroup;
    if (!root) return;
    const geometries = new Set<BufferGeometry>();
    const materials = new Set<Material>();
    const textures = new Set<Texture>();
    root.traverse((object: Object3D) => {
      if (object instanceof Mesh || object instanceof Line) {
        geometries.add(object.geometry);
        for (const material of Array.isArray(object.material)
          ? object.material
          : [object.material]) {
          materials.add(material);
        }
      } else if (object instanceof Sprite) {
        materials.add(object.material);
        if (object.material.map) textures.add(object.material.map);
      }
    });
    root.removeFromParent();
    for (const texture of textures) texture.dispose();
    for (const material of materials) material.dispose();
    for (const geometry of geometries) geometry.dispose();
    this.visualGroup = undefined;
  }

  private emitState(): void {
    this.options.onStateChange?.(this.getState());
  }
}
