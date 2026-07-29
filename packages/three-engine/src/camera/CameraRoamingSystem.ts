import type { CameraRoamingPath } from '@digital-twin/scene-schema';
import {
  AdditiveBlending,
  BufferGeometry,
  CanvasTexture,
  CircleGeometry,
  Color,
  CylinderGeometry,
  DoubleSide,
  Group,
  IcosahedronGeometry,
  Line,
  LineBasicMaterial,
  LineDashedMaterial,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  OctahedronGeometry,
  Plane,
  Quaternion,
  Raycaster,
  RingGeometry,
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
const DEFAULT_ROAM_SPEED = 4;
const CAMERA_OFFSET_FROM_PATH_POINT = 1.4;
const MIN_SEGMENT_DURATION = 0.4;
const TURN_START = 0.8;
const EPSILON = 1e-6;
const GROUND_POINT_HEIGHT = 0.5;
const PATH_POINT_OFFSET = 0.05;
const WORLD_UP = new Vector3(0, 1, 0);

const PATH_COLORS = {
  trailCore: 0xffc357,
  trailGlow: 0x38bdf8,
  waypoint: '#38bdf8',
  waypointDeep: '#0ea5e9',
  start: '#ff7a59',
  startDeep: '#ff4d6d',
  end: '#34d399',
  endDeep: '#10b981',
} as const;

type CameraRoamingVisualKind = 'drawing' | 'hover' | 'preview';
type CameraRoamingMarkerRole = 'start' | 'waypoint' | 'end';

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

interface MarkerPalette {
  accent: string;
  deep: string;
  label: 'S' | 'E' | '';
}

/**
 * 编辑器与 Runtime 共用的相机漫游状态机。
 * 绘制、悬停、预览分别拥有视觉组，避免一个交互清理掉另一个交互的 GPU 资源。
 */
export class CameraRoamingSystem {
  private mode: CameraRoamingMode = 'idle';
  private activePathId: string | null = null;
  private readonly drawingPoints: Vector3[] = [];
  private playbackPoints: Vector3[] = [];
  private playbackSpeed = DEFAULT_ROAM_SPEED;
  private segmentIndex = 0;
  private segmentElapsed = 0;
  private pointerStart?: PointerStart;
  private modifierPressed = false;
  private drawingVisualGroup?: Group;
  private hoverVisualGroup?: Group;
  private previewVisualGroup?: Group;
  private controlsWereEnabled = true;
  private drawingListenersAttached = false;
  private disposed = false;
  private readonly raycaster = new Raycaster();
  private readonly pointer = new Vector2();
  private readonly groundPlane = new Plane(WORLD_UP, 0);
  private readonly lookMatrix = new Matrix4();
  private readonly currentQuaternion = new Quaternion();
  private readonly nextQuaternion = new Quaternion();
  private readonly currentDirection = new Vector3();
  private readonly nextDirection = new Vector3();
  private readonly lookTarget = new Vector3();
  private readonly verticalLookUp = new Vector3();
  private readonly lastForwardDirection = new Vector3(0, 0, -1);
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
    this.hideHoverPath();
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

  /** 在路径卡片悬停期间显示完整路径，且不进入播放状态。 */
  showHoverPath(path: CameraRoamingPath): boolean {
    if (this.disposed || path.pathPoints.length === 0) {
      this.hideHoverPath();
      return false;
    }
    const points = this.toVectorPoints(path.pathPoints);
    this.replaceVisualGroup('hover', points, true);
    this.options.invalidate();
    return true;
  }

  hideHoverPath(): void {
    if (!this.hoverVisualGroup) return;
    this.disposeVisualGroup(this.hoverVisualGroup);
    this.hoverVisualGroup = undefined;
    this.options.invalidate();
  }

  preview(path: CameraRoamingPath): boolean {
    if (this.disposed) return false;
    if (this.mode === 'drawing') this.cancelDrawing();
    if (this.mode === 'previewing') this.stopPreview();
    this.hideHoverPath();

    const rawPoints = this.toVectorPoints(path.pathPoints);
    const elevatedPoints = rawPoints.map(
      (point) =>
        new Vector3(point.x, point.y + CAMERA_OFFSET_FROM_PATH_POINT, point.z),
    );
    // 重复点无法产生有效朝向，播放前过滤，路径可视化仍保留用户保存的原始点位。
    this.playbackPoints = elevatedPoints.filter(
      (point, index) =>
        index === 0 ||
        point.distanceToSquared(elevatedPoints[index - 1]!) > EPSILON * EPSILON,
    );
    if (this.playbackPoints.length < 2) {
      this.playbackPoints = [];
      return false;
    }

    this.playbackSpeed =
      Number.isFinite(path.speed) && path.speed > 0
        ? path.speed
        : DEFAULT_ROAM_SPEED;
    this.controlsWereEnabled = this.options.controls.enabled;
    this.options.controls.enabled = false;
    this.segmentIndex = 0;
    this.segmentElapsed = 0;
    this.mode = 'previewing';
    this.activePathId = path.id;
    this.options.camera.position.copy(this.playbackPoints[0]!);
    this.resolveMoveDirection(
      this.playbackPoints[0]!,
      this.playbackPoints[1]!,
      this.currentDirection,
    );
    this.lastForwardDirection.copy(this.currentDirection);
    this.options.camera.quaternion.copy(
      this.getLookQuaternion(
        this.playbackPoints[0]!,
        this.currentDirection,
        this.currentQuaternion,
      ),
    );
    this.replaceVisualGroup('preview', rawPoints, true);
    this.emitState();
    this.options.invalidate();
    return true;
  }

  stopPreview(): void {
    if (this.mode !== 'previewing') return;
    this.options.controls.enabled = this.controlsWereEnabled;
    this.playbackPoints = [];
    this.playbackSpeed = DEFAULT_ROAM_SPEED;
    this.segmentIndex = 0;
    this.segmentElapsed = 0;
    this.activePathId = null;
    this.mode = 'idle';
    if (this.previewVisualGroup) {
      this.disposeVisualGroup(this.previewVisualGroup);
      this.previewVisualGroup = undefined;
    }
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
        start.distanceTo(end) / this.playbackSpeed,
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
    this.clearDrawingPoints();
    this.hideHoverPath();
    if (this.previewVisualGroup) {
      this.disposeVisualGroup(this.previewVisualGroup);
      this.previewVisualGroup = undefined;
    }
    this.mode = 'idle';
    this.activePathId = null;
    this.disposed = true;
  }

  private applySegmentOrientation(
    start: Vector3,
    end: Vector3,
    progress: number,
  ): void {
    this.resolveMoveDirection(start, end, this.currentDirection);
    this.lastForwardDirection.copy(this.currentDirection);
    this.getLookQuaternion(
      start,
      this.currentDirection,
      this.currentQuaternion,
    );
    const following = this.playbackPoints[this.segmentIndex + 2];
    if (!following || progress <= TURN_START) {
      this.options.camera.quaternion.copy(this.currentQuaternion);
      return;
    }
    this.resolveMoveDirection(end, following, this.nextDirection);
    this.getLookQuaternion(end, this.nextDirection, this.nextQuaternion);
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

  private resolveMoveDirection(
    start: Vector3,
    end: Vector3,
    result: Vector3,
  ): Vector3 {
    result.subVectors(end, start);
    return result.lengthSq() > EPSILON * EPSILON
      ? result.normalize()
      : result.copy(this.lastForwardDirection);
  }

  private getLookQuaternion(
    position: Vector3,
    direction: Vector3,
    result: Quaternion,
  ): Quaternion {
    const target = this.lookTarget.copy(position).add(direction);
    // lookAt 的方向与 up 几乎平行时矩阵会退化，源站改用 Z 轴作为临时上方向。
    const up =
      Math.abs(direction.dot(WORLD_UP)) > 0.999
        ? this.verticalLookUp.set(0, 0, direction.y >= 0 ? -1 : 1)
        : WORLD_UP;
    this.lookMatrix.lookAt(position, target, up);
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
    this.replaceVisualGroup('drawing', this.drawingPoints, false);
    this.emitState();
    this.options.invalidate();
  };

  private finishDrawing(): void {
    if (this.mode !== 'drawing') return;
    if (this.drawingPoints.length < 2) {
      // 源站不足两点时清空当前段并继续等待用户重新按修饰键绘制。
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
    const camera = this.options.camera;

    // 源站对 (0, 0) 保留了一个相机前向取点分支，避免容器坐标尚未就绪时产生无穷值。
    if (clientX === 0 && clientY === 0) {
      const direction = new Vector3();
      camera.getWorldDirection(direction);
      const visibleHalfHeight =
        Math.abs(camera.position.y) * Math.tan((camera.fov * Math.PI) / 360);
      const point = camera.position
        .clone()
        .add(direction.multiplyScalar(Math.max(visibleHalfHeight, 5)));
      point.y = Math.max(GROUND_POINT_HEIGHT, point.y);
      point.y += PATH_POINT_OFFSET;
      return point;
    }

    const rect = this.options.canvas.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return undefined;
    this.pointer.set(
      ((clientX - rect.left) / rect.width) * 2 - 1,
      -((clientY - rect.top) / rect.height) * 2 + 1,
    );
    this.raycaster.setFromCamera(this.pointer, camera);

    const point = new Vector3();
    if (!this.raycaster.ray.intersectPlane(this.groundPlane, point)) {
      const direction = new Vector3();
      camera.getWorldDirection(direction);
      const visibleHalfHeight =
        Math.abs(camera.position.y) * Math.tan((camera.fov * Math.PI) / 360);
      point
        .copy(camera.position)
        .add(direction.multiplyScalar(Math.max(visibleHalfHeight, 5)));
      point.y += PATH_POINT_OFFSET;
      return point;
    }

    const maxDistance = Math.max(camera.position.length() * 2, 50);
    if (point.distanceTo(camera.position) > maxDistance) {
      // 原站不会丢弃过远点击，而是沿当前射线截断到相机的最大可取点距离。
      point
        .sub(camera.position)
        .normalize()
        .multiplyScalar(maxDistance)
        .add(camera.position);
    }
    point.y = Math.max(GROUND_POINT_HEIGHT, point.y) + PATH_POINT_OFFSET;
    return point;
  }

  private clearDrawingPoints(): void {
    this.drawingPoints.length = 0;
    if (this.drawingVisualGroup) {
      this.disposeVisualGroup(this.drawingVisualGroup);
      this.drawingVisualGroup = undefined;
    }
    this.options.invalidate();
  }

  private toVectorPoints(points: CameraRoamingPath['pathPoints']): Vector3[] {
    return points.map(([x, y, z]) => new Vector3(x, y, z));
  }

  private replaceVisualGroup(
    kind: CameraRoamingVisualKind,
    points: readonly Vector3[],
    markEnd: boolean,
  ): void {
    const property = `${kind}VisualGroup` as const;
    const previous = this[property];
    if (previous) this.disposeVisualGroup(previous);

    const group = this.buildVisualGroup(kind, points, markEnd);
    this[property] = group;
    this.options.scene.add(group);
  }

  private buildVisualGroup(
    kind: CameraRoamingVisualKind,
    points: readonly Vector3[],
    markEnd: boolean,
  ): Group {
    const group = new Group();
    group.name = `__camera_roaming_${kind}_visuals__`;
    group.userData.editorHelper = true;
    group.userData.cameraRoamingVisualKind = kind;
    const lastIndex = points.length - 1;
    points.forEach((point, index) => {
      const role: CameraRoamingMarkerRole =
        index === 0
          ? 'start'
          : markEnd && index === lastIndex
            ? 'end'
            : 'waypoint';
      group.add(this.createMarker(point, index, role));
    });
    if (points.length >= 2) group.add(this.createTrailGroup(points));
    return group;
  }

  private createTrailGroup(points: readonly Vector3[]): Group {
    const group = new Group();
    group.name = 'camera-roaming-trail';

    const glowLine = new Line(
      new BufferGeometry().setFromPoints([...points]),
      new LineBasicMaterial({
        color: PATH_COLORS.trailGlow,
        transparent: true,
        opacity: 0.28,
        depthWrite: false,
        blending: AdditiveBlending,
      }),
    );
    glowLine.renderOrder = 8;
    group.add(glowLine);

    const dashedGlow = new Line(
      new BufferGeometry().setFromPoints([...points]),
      new LineDashedMaterial({
        color: PATH_COLORS.trailGlow,
        transparent: true,
        opacity: 0.72,
        dashSize: 0.42,
        gapSize: 0.18,
        depthWrite: false,
      }),
    );
    dashedGlow.computeLineDistances();
    dashedGlow.renderOrder = 9;
    group.add(dashedGlow);

    const coreLine = new Line(
      new BufferGeometry().setFromPoints([...points]),
      new LineDashedMaterial({
        color: PATH_COLORS.trailCore,
        transparent: true,
        opacity: 0.95,
        dashSize: 0.16,
        gapSize: 0.22,
        depthWrite: false,
      }),
    );
    coreLine.computeLineDistances();
    coreLine.renderOrder = 10;
    group.add(coreLine);

    for (let index = 0; index < points.length - 1; index += 1) {
      const start = points[index]!;
      const end = points[index + 1]!;
      const direction = new Vector3().subVectors(end, start);
      if (direction.lengthSq() < EPSILON * EPSILON) continue;
      direction.normalize();
      const midpoint = new Vector3().lerpVectors(start, end, 0.5);
      const indicator = new Mesh(
        new OctahedronGeometry(0.045, 0),
        new MeshBasicMaterial({
          color: PATH_COLORS.trailCore,
          transparent: true,
          opacity: 0.85,
          depthWrite: false,
        }),
      );
      indicator.position.copy(midpoint);
      indicator.position.y += 0.04;
      indicator.lookAt(midpoint.clone().add(direction));
      indicator.rotateX(Math.PI / 2);
      indicator.renderOrder = 11;
      group.add(indicator);
    }
    return group;
  }

  private createMarker(
    point: Vector3,
    index: number,
    role: CameraRoamingMarkerRole,
  ): Group {
    const marker = new Group();
    marker.name = `camera-roaming-marker-${index}`;
    marker.position.copy(point);
    marker.userData.editorHelper = true;
    marker.userData.cameraRoamingRole = role;
    const palette = this.resolveMarkerPalette(role);
    marker.userData.cameraRoamingLabel = palette.label;
    const accent = new Color(palette.accent);
    const deep = new Color(palette.deep);

    const glow = new Mesh(
      new CircleGeometry(0.38, 48),
      new MeshBasicMaterial({
        color: accent,
        transparent: true,
        opacity: 0.22,
        depthWrite: false,
        side: DoubleSide,
        blending: AdditiveBlending,
      }),
    );
    glow.rotation.x = -Math.PI / 2;
    glow.position.y = 0.012;
    glow.renderOrder = 8;
    marker.add(glow);

    const innerRing = new Mesh(
      new RingGeometry(0.16, 0.2, 48),
      new MeshBasicMaterial({
        color: accent,
        transparent: true,
        opacity: 0.9,
        depthWrite: false,
        side: DoubleSide,
        blending: AdditiveBlending,
      }),
    );
    innerRing.rotation.x = -Math.PI / 2;
    innerRing.position.y = 0.018;
    innerRing.renderOrder = 9;
    marker.add(innerRing);

    const outerRing = new Mesh(
      new RingGeometry(0.28, 0.3, 64),
      new MeshBasicMaterial({
        color: deep,
        transparent: true,
        opacity: 0.45,
        depthWrite: false,
        side: DoubleSide,
        blending: AdditiveBlending,
      }),
    );
    outerRing.rotation.x = -Math.PI / 2;
    outerRing.position.y = 0.016;
    outerRing.renderOrder = 9;
    marker.add(outerRing);

    const pillarHeight = role === 'waypoint' ? 0.55 : 0.72;
    const pillar = new Mesh(
      new CylinderGeometry(0.012, 0.028, pillarHeight, 10, 1, true),
      new MeshBasicMaterial({
        color: accent,
        transparent: true,
        opacity: 0.35,
        depthWrite: false,
        blending: AdditiveBlending,
        side: DoubleSide,
      }),
    );
    pillar.position.y = pillarHeight / 2;
    pillar.renderOrder = 10;
    marker.add(pillar);

    const coreHeight = role === 'waypoint' ? 0.42 : 0.52;
    const core = new Mesh(
      new OctahedronGeometry(role === 'waypoint' ? 0.085 : 0.1, 0),
      new MeshStandardMaterial({
        color: '#ffffff',
        emissive: accent,
        emissiveIntensity: 1.8,
        metalness: 0.85,
        roughness: 0.12,
        transparent: true,
        opacity: 0.95,
      }),
    );
    core.position.y = coreHeight;
    core.rotation.y = Math.PI / 4;
    core.renderOrder = 12;
    marker.add(core);

    const shell = new Mesh(
      new IcosahedronGeometry(role === 'waypoint' ? 0.12 : 0.14, 0),
      new MeshBasicMaterial({
        color: accent,
        transparent: true,
        opacity: 0.18,
        depthWrite: false,
        wireframe: true,
      }),
    );
    shell.position.y = coreHeight;
    shell.renderOrder = 11;
    marker.add(shell);

    if (role !== 'waypoint') {
      const halo = new Mesh(
        new TorusGeometry(0.14, 0.012, 8, 32),
        new MeshBasicMaterial({
          color: accent,
          transparent: true,
          opacity: 0.75,
          depthWrite: false,
          blending: AdditiveBlending,
        }),
      );
      halo.position.y = coreHeight + 0.02;
      halo.rotation.x = Math.PI / 2.6;
      halo.renderOrder = 12;
      marker.add(halo);
    }

    const label = this.createLabel(index, role, palette);
    if (label) marker.add(label);
    return marker;
  }

  private resolveMarkerPalette(role: CameraRoamingMarkerRole): MarkerPalette {
    if (role === 'start') {
      return {
        accent: PATH_COLORS.start,
        deep: PATH_COLORS.startDeep,
        label: 'S',
      };
    }
    if (role === 'end') {
      return {
        accent: PATH_COLORS.end,
        deep: PATH_COLORS.endDeep,
        label: 'E',
      };
    }
    return {
      accent: PATH_COLORS.waypoint,
      deep: PATH_COLORS.waypointDeep,
      label: '',
    };
  }

  private createLabel(
    index: number,
    role: CameraRoamingMarkerRole,
    palette: MarkerPalette,
  ): Sprite | undefined {
    if (typeof document === 'undefined') return undefined;
    const canvas = document.createElement('canvas');
    canvas.width = 192;
    canvas.height = 192;
    const context = canvas.getContext('2d');
    if (!context) return undefined;
    const center = 96;
    const gradient = context.createRadialGradient(
      center,
      center,
      12,
      center,
      center,
      88,
    );
    gradient.addColorStop(0, this.hexToRgba(palette.accent, 0.55));
    gradient.addColorStop(0.45, this.hexToRgba(palette.accent, 0.22));
    gradient.addColorStop(1, this.hexToRgba(palette.accent, 0));
    context.fillStyle = gradient;
    context.beginPath();
    context.arc(center, center, 88, 0, Math.PI * 2);
    context.fill();

    const width = role === 'waypoint' ? 78 : 92;
    const height = 46;
    this.roundRect(
      context,
      center - width / 2,
      center - height / 2,
      width,
      height,
      14,
    );
    context.fillStyle = 'rgba(8, 18, 36, 0.88)';
    context.fill();
    this.roundRect(
      context,
      center - width / 2,
      center - height / 2,
      width,
      height,
      14,
    );
    context.strokeStyle = this.hexToRgba(palette.accent, 0.95);
    context.lineWidth = 3;
    context.stroke();
    context.fillStyle = '#ffffff';
    context.font = '700 36px "Segoe UI", "PingFang SC", sans-serif';
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    const sequence = String(index + 1);
    if (palette.label) {
      context.fillText(sequence, center - 10, center + 1);
      context.fillStyle = this.hexToRgba(palette.accent, 1);
      context.font = '700 18px "Segoe UI", "PingFang SC", sans-serif';
      context.fillText(palette.label, center + 22, center + 1);
    } else {
      context.fillText(sequence, center, center + 1);
    }

    const texture = new CanvasTexture(canvas);
    texture.needsUpdate = true;
    const sprite = new Sprite(
      new SpriteMaterial({
        map: texture,
        transparent: true,
        depthTest: false,
        depthWrite: false,
      }),
    );
    sprite.scale.set(0.62, 0.62, 0.62);
    sprite.position.y = role === 'waypoint' ? 0.78 : 0.92;
    sprite.renderOrder = 14;
    return sprite;
  }

  private hexToRgba(hex: string, alpha: number): string {
    const color = new Color(hex);
    return `rgba(${Math.round(color.r * 255)}, ${Math.round(color.g * 255)}, ${Math.round(color.b * 255)}, ${alpha})`;
  }

  private roundRect(
    context: CanvasRenderingContext2D,
    x: number,
    y: number,
    width: number,
    height: number,
    radius: number,
  ): void {
    const safeRadius = Math.min(radius, width / 2, height / 2);
    context.beginPath();
    context.moveTo(x + safeRadius, y);
    context.arcTo(x + width, y, x + width, y + height, safeRadius);
    context.arcTo(x + width, y + height, x, y + height, safeRadius);
    context.arcTo(x, y + height, x, y, safeRadius);
    context.arcTo(x, y, x + width, y, safeRadius);
    context.closePath();
  }

  private disposeVisualGroup(root: Group): void {
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
  }

  private emitState(): void {
    this.options.onStateChange?.(this.getState());
  }
}
