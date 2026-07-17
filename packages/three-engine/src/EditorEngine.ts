import {
  Box3,
  Color,
  EventDispatcher,
  NeutralToneMapping,
  PCFShadowMap,
  PerspectiveCamera,
  PMREMGenerator,
  Scene,
  Sphere,
  SRGBColorSpace,
  Timer,
  Vector3,
  WebGLRenderer,
  type Object3D,
} from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import type { TransformControlsMode } from 'three/addons/controls/TransformControls.js';
import { HDRLoader } from 'three/addons/loaders/HDRLoader.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import type {
  CameraRoamingPath,
  SceneDocument,
  SceneCamera,
  SceneNode,
  Transform,
} from '@digital-twin/scene-schema';
import { createDefaultSceneCamera } from '@digital-twin/scene-schema';
import { AssetInstanceSystem } from './assets/AssetInstanceSystem.js';
import { AssetLoader } from './assets/AssetLoader.js';
import type { AssetResolver } from './assets/types.js';
import {
  CameraRoamingSystem,
  type CameraRoamingState,
} from './camera/CameraRoamingSystem.js';
import { SceneDocumentSystem } from './documents/SceneDocumentSystem.js';
import {
  SelectionSystem,
  type SelectionState,
} from './interaction/SelectionSystem.js';
import { SelectionBoxSystem } from './interaction/SelectionBoxSystem.js';
import { alignObjectToGround } from './interaction/SceneAlignmentSystem.js';
import { MeasurementSystem } from './interaction/MeasurementSystem.js';
import { configureOrbitControls } from './interaction/OrbitControlsProfile.js';
import { PointerLockSystem } from './interaction/PointerLockSystem.js';
import {
  TransformSystem,
  type TransformCommit,
} from './interaction/TransformSystem.js';
import {
  ViewportCameraSystem,
  type CameraOrientation,
  type CameraView,
} from './interaction/ViewportCameraSystem.js';
import { ViewportGizmoSystem } from './interaction/ViewportGizmoSystem.js';
import { ViewportDropSystem } from './interaction/ViewportDropSystem.js';
import { MaterialSystem } from './materials/MaterialSystem.js';
import { ResourceTracker } from './ResourceTracker';
import { BUILTIN_ENVIRONMENT_URL } from './settings/builtinAssets.js';
import { GroundSystem } from './settings/GroundSystem.js';
import {
  SceneSettingsSystem,
  type EnvironmentMapTarget,
} from './settings/SceneSettingsSystem.js';
import { loadEditorEnvironment } from './settings/loadEditorEnvironment.js';
import { WeatherSystem } from './settings/WeatherSystem.js';
import type {
  LoadReport,
  ModelStructureMap,
  RenderStats,
  SceneStats,
} from './types.js';

export const DEFAULT_EDITOR_ENVIRONMENT_URL = BUILTIN_ENVIRONMENT_URL;

export interface EditorEngineOptions {
  /** 传入 null 可跳过本地 HDR，主要用于宿主自定义或故障诊断。 */
  defaultEnvironmentUrl?: string | null;
}

interface ScreenshotRequest {
  resolve(blob: Blob): void;
  reject(reason: Error): void;
}

function snapshotTransform(object: Object3D): Transform {
  return {
    position: object.position.toArray() as Transform['position'],
    rotation: object.rotation.toArray() as Transform['rotation'],
    scale: object.scale.toArray() as Transform['scale'],
  };
}

export interface EditorEngineEventMap {
  selectionchange: SelectionState;
  pointerlockchange: { active: boolean };
  measurechange: { active: boolean };
  transformstart: { nodeId: string; before: Transform };
  transformchange: { nodeId: string; transform: Transform };
  transformend: TransformCommit;
  statschange: SceneStats;
  camerachange: CameraOrientation;
  camerastatechange: { camera: SceneCamera };
  cameraroamingstatechange: CameraRoamingState;
  cameraroamingpathcreated: {
    pathPoints: Array<[number, number, number]>;
  };
  renderstatschange: RenderStats;
}

/**
 * 统一拥有场景渲染循环、容器尺寸监听、控制器、后期通道和 GPU 资源。
 * 调用方必须在组件卸载时执行 dispose，不能单独销毁其中任意成员。
 */
export class EditorEngine extends EventDispatcher<EditorEngineEventMap> {
  readonly scene = new Scene();
  readonly camera = new PerspectiveCamera(45, 1, 0.05, 20_000);
  private readonly timer = new Timer();
  private readonly resources = new ResourceTracker();
  private renderer?: WebGLRenderer;
  private controls?: OrbitControls;
  private composer?: EffectComposer;
  private output?: OutputPass;
  private documentSystem?: SceneDocumentSystem;
  private selectionSystem?: SelectionSystem;
  private selectionHighlight?: SelectionBoxSystem;
  private activeModelPart?: {
    nodeId: string;
    objectId: string;
    object: Object3D;
  };
  private transformSystem?: TransformSystem;
  private pointerLockSystem?: PointerLockSystem;
  private measurementSystem?: MeasurementSystem;
  private dropSystem?: ViewportDropSystem;
  private cameraSystem?: ViewportCameraSystem;
  private cameraRoamingSystem?: CameraRoamingSystem;
  private cameraRoamingList: CameraRoamingPath[] = [];
  private viewportGizmo?: ViewportGizmoSystem;
  private settingsSystem?: SceneSettingsSystem;
  private groundSystem?: GroundSystem;
  private weatherSystem?: WeatherSystem;
  private fallbackEnvironmentTarget?: EnvironmentMapTarget;
  private assetResolver?: AssetResolver;
  private resizeObserver?: ResizeObserver;
  private frameId?: number;
  private renderStatsStartedAt = 0;
  private renderStatsFrames = 0;
  private screenshotQueue: ScreenshotRequest[] = [];
  private activeScreenshot?: ScreenshotRequest[];
  private invalidated = true;
  private disposed = false;

  constructor(private readonly options: EditorEngineOptions = {}) {
    super();
  }

  async initialize(container: HTMLElement): Promise<void> {
    if (this.renderer) throw new Error('EditorEngine 已初始化');
    if (this.disposed) throw new Error('已销毁的 EditorEngine 不能重新初始化');

    this.scene.background = new Color('#3b3b3b');
    // 相机初始位置和重置位置都与源站 initCamera 保持一致。
    this.camera.position.set(0.607, 3.347, 7.966);
    this.camera.rotation.set(-0.304, 0.048, 0.016);

    const renderer = new WebGLRenderer({
      antialias: true,
      powerPreference: 'high-performance',
    });
    renderer.outputColorSpace = SRGBColorSpace;
    renderer.toneMapping = NeutralToneMapping;
    renderer.toneMappingExposure = 1.2;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = PCFShadowMap;
    container.append(renderer.domElement);
    this.renderer = renderer;

    const environmentGenerator = new PMREMGenerator(renderer);
    environmentGenerator.compileEquirectangularShader();
    const environmentUrl =
      this.options.defaultEnvironmentUrl === undefined
        ? DEFAULT_EDITOR_ENVIRONMENT_URL
        : this.options.defaultEnvironmentUrl;
    let fallbackEnvironmentTarget: EnvironmentMapTarget | undefined;
    let defaultEnvironmentError: unknown;
    if (environmentUrl) {
      try {
        fallbackEnvironmentTarget = await loadEditorEnvironment(
          environmentUrl,
          {
            loader: new HDRLoader(),
            generator: environmentGenerator,
            isStale: () => this.disposed,
          },
        );
      } catch (error) {
        defaultEnvironmentError = error;
      }
    }
    if (this.disposed) {
      fallbackEnvironmentTarget?.dispose();
      environmentGenerator.dispose();
      return;
    }
    if (!fallbackEnvironmentTarget) {
      // 本地静态资源部署异常时才使用白色房间兜底，正常主路径必须保持 Venice HDR。
      const roomEnvironment = new RoomEnvironment();
      try {
        fallbackEnvironmentTarget =
          environmentGenerator.fromScene(roomEnvironment);
      } finally {
        roomEnvironment.dispose();
      }
      if (defaultEnvironmentError) {
        console.warn(
          '默认 Venice HDR 加载失败，编辑器已降级使用 RoomEnvironment',
          defaultEnvironmentError,
        );
      }
    }
    this.fallbackEnvironmentTarget = fallbackEnvironmentTarget;
    this.scene.environmentRotation.set(0, Math.PI / 2, 0);
    this.settingsSystem = new SceneSettingsSystem(this.scene, renderer, {
      includeGrid: false,
      fallbackEnvironment: fallbackEnvironmentTarget.texture,
      environmentGenerator,
    });
    this.groundSystem = new GroundSystem(this.scene);
    this.weatherSystem = new WeatherSystem(this.scene);

    this.controls = new OrbitControls(this.camera, renderer.domElement);
    // ThreeFlowX 4.0.4 编辑器使用左键平移、滚轮缩放、右键旋转。
    configureOrbitControls(this.controls, { enablePan: true });
    this.controls.addEventListener('change', this.invalidate);
    this.controls.addEventListener('change', this.emitCameraOrientation);
    this.controls.addEventListener('start', this.cancelCameraAnimation);
    this.controls.addEventListener('end', this.emitCameraState);
    this.pointerLockSystem = new PointerLockSystem(
      this.camera,
      renderer.domElement,
      {
        onStateChange: (active) => {
          this.controls!.enabled = !active;
          this.selectionSystem?.setEnabled(
            !active && !this.measurementSystem?.active,
          );
          this.dispatchEvent({ type: 'pointerlockchange', active });
          this.invalidate();
        },
        onChange: this.invalidate,
      },
    );
    this.cameraSystem = new ViewportCameraSystem(this.camera, this.controls);
    this.cameraRoamingSystem = new CameraRoamingSystem({
      scene: this.scene,
      camera: this.camera,
      canvas: renderer.domElement,
      controls: this.controls,
      invalidate: this.invalidate,
      onStateChange: (state) => {
        this.selectionSystem?.setEnabled(
          state.mode === 'idle' &&
            !this.pointerLockSystem?.isActive &&
            !this.measurementSystem?.active,
        );
        this.dispatchEvent({ type: 'cameraroamingstatechange', ...state });
        this.invalidate();
      },
      onPathCreated: (pathPoints) => {
        this.dispatchEvent({
          type: 'cameraroamingpathcreated',
          pathPoints,
        });
      },
    });
    this.viewportGizmo = new ViewportGizmoSystem({
      camera: this.camera,
      renderer,
      controls: this.controls,
      container,
      invalidate: this.invalidate,
    });
    this.controls.update();
    this.emitCameraOrientation();

    this.composer = new EffectComposer(renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    // 中间 RenderTarget 是线性色彩；末尾 OutputPass 负责 r183 tone mapping 与 sRGB 输出。
    this.output = new OutputPass();
    this.composer.addPass(this.output);
    this.selectionHighlight = new SelectionBoxSystem(this.scene);

    this.dropSystem = new ViewportDropSystem(this.camera, renderer.domElement);
    this.transformSystem = new TransformSystem({
      scene: this.scene,
      camera: this.camera,
      canvas: renderer.domElement,
      getObject: (nodeId) => this.documentSystem?.getObject(nodeId),
      onChange: this.invalidate,
      onTransformStart: (nodeId, before) => {
        // 阻止手柄 pointerup 穿透到选择系统，导致拖动结束后反向切换选中。
        this.selectionSystem?.suppressNextPointerUp();
        this.dispatchEvent({ type: 'transformstart', nodeId, before });
      },
      onTransformChange: (nodeId, transform) => {
        this.invalidate();
        this.dispatchEvent({ type: 'transformchange', nodeId, transform });
      },
      onTransformEnd: (commit) => {
        this.dispatchEvent({ type: 'transformend', ...commit });
      },
      onDraggingChange: (dragging) => {
        if (this.controls) this.controls.enabled = !dragging;
      },
    });

    this.resizeObserver = new ResizeObserver(([entry]) => {
      if (!entry) return;
      this.resize(
        entry.contentRect.width,
        entry.contentRect.height,
        window.devicePixelRatio,
      );
    });
    this.resizeObserver.observe(container);
    this.timer.connect(document);
    this.renderStatsStartedAt = performance.now();
    this.loop();
  }

  readonly invalidate = (): void => {
    this.invalidated = true;
  };

  resize(width: number, height: number, dpr: number): void {
    if (!this.renderer || !this.composer || width <= 0 || height <= 0) return;
    const pixelRatio = Math.min(dpr, 2);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setPixelRatio(pixelRatio);
    this.renderer.setSize(width, height, false);
    this.composer.setPixelRatio(pixelRatio);
    this.composer.setSize(width, height);
    this.viewportGizmo?.resize();
    this.invalidate();
  }

  private readonly loop = (timestamp?: number): void => {
    if (this.disposed) return;
    this.frameId = requestAnimationFrame(this.loop);
    this.timer.update(timestamp);
    const delta = this.timer.getDelta();
    const elapsed = this.timer.getElapsed();
    this.groundSystem?.update(elapsed);
    this.weatherSystem?.update(delta, elapsed);
    if (this.groundSystem?.isAnimated || this.weatherSystem?.isActive) {
      this.invalidated = true;
    }
    const roamingChanged = this.cameraRoamingSystem?.update(delta) ?? false;
    const roamingActive =
      this.cameraRoamingSystem?.getState().mode === 'previewing';
    const cameraAnimating =
      !roamingActive && !roamingChanged
        ? (this.cameraSystem?.update(delta) ?? false)
        : false;
    if (!roamingActive && !roamingChanged && !cameraAnimating) {
      if (this.pointerLockSystem?.isLocked) {
        this.pointerLockSystem.update(delta);
      } else {
        this.controls?.update(delta);
      }
    }
    if (roamingChanged || cameraAnimating || this.viewportGizmo?.animating) {
      this.invalidated = true;
    }
    this.emitRenderStatsIfNeeded();
    if (!this.invalidated) return;

    this.selectionHighlight?.update();
    // 先消费当前脏标记，渲染期间产生的新事件才能正确请求下一帧。
    this.invalidated = false;
    // Composer 是启用后期处理时唯一的最终渲染路径，不能再调用 renderer.render。
    this.composer?.render(delta);
    if (this.viewportGizmo?.render()) this.invalidated = true;
    this.flushScreenshotRequests();
  };

  track(root: Parameters<ResourceTracker['track']>[0]): void {
    this.resources.track(root);
  }

  async loadDocument(
    document: SceneDocument,
    resolver: AssetResolver,
  ): Promise<LoadReport> {
    if (!this.renderer) throw new Error('EditorEngine 尚未初始化');
    this.applyCameraRoamingList(document.cameraRoamingList);
    this.applyCamera(document.camera);
    this.settingsSystem?.apply(document.settings);
    await Promise.all([
      this.settingsSystem?.applyBackground(document.settings, resolver),
      this.settingsSystem?.applyEnvironment(document.settings, resolver),
      this.groundSystem?.apply(document.settings.groundType),
      this.weatherSystem?.apply(document.settings),
    ]);
    this.pointerLockSystem?.deactivate();
    this.measurementSystem?.end();
    this.selectionSystem?.setEnabled(true);
    this.selectionSystem?.setSelection([]);
    this.transformSystem?.setSelection(null);
    this.activeModelPart = undefined;
    if (!this.documentSystem || resolver !== this.assetResolver) {
      this.selectionSystem?.dispose();
      this.selectionSystem = undefined;
      this.measurementSystem?.dispose();
      this.measurementSystem = undefined;
      this.documentSystem?.dispose();
      const loader = new AssetLoader({ renderer: this.renderer });
      this.documentSystem = new SceneDocumentSystem(
        this.scene,
        new AssetInstanceSystem(resolver, loader),
        new MaterialSystem(resolver),
      );
      this.assetResolver = resolver;
    }
    const report = await this.documentSystem.loadDocument(document);
    this.ensureSelectionSystem();
    this.emitStats();
    this.invalidate();
    return report;
  }

  addNode(node: SceneNode): Promise<Object3D> {
    if (!this.documentSystem) throw new Error('尚未加载场景文档');
    return this.documentSystem.addNode(node).then((object) => {
      this.emitStats();
      this.invalidate();
      return object;
    });
  }

  removeNodes(ids: Iterable<string>): void {
    const removing = [...ids];
    const selectedPart = this.activeModelPart;
    this.documentSystem?.removeNodes(removing);
    const selection = this.selectionSystem?.getSelection();
    if (selection) {
      this.selectionSystem?.setSelection(selection.ids, selection.primaryId);
    }
    if (selectedPart) this.restoreModelPartSelection(selectedPart);
    this.emitStats();
    this.invalidate();
  }

  async updateNode(node: SceneNode): Promise<void> {
    const selectedPart = this.activeModelPart;
    await this.documentSystem?.updateNode(node);
    const selection = this.selectionSystem?.getSelection();
    if (selection?.ids.includes(node.id)) {
      this.selectionSystem?.setSelection(selection.ids, selection.primaryId);
    }
    const restoredPart = selectedPart
      ? this.restoreModelPartSelection(selectedPart)
      : false;
    if (selection?.primaryId === node.id && !restoredPart) {
      // 锁定状态可由属性面板实时修改，手柄 attach 状态必须同步刷新。
      this.transformSystem?.setSelection(selection.primaryId);
    }
    this.emitStats();
    this.invalidate();
  }

  async updateSettings(settings: SceneDocument['settings']): Promise<void> {
    this.settingsSystem?.apply(settings);
    if (this.assetResolver) {
      await Promise.all([
        this.settingsSystem?.applyBackground(settings, this.assetResolver),
        this.settingsSystem?.applyEnvironment(settings, this.assetResolver),
        this.groundSystem?.apply(settings.groundType),
        this.weatherSystem?.apply(settings),
      ]);
    }
    this.invalidate();
  }

  /** 把持久化 DTO 应用到活动 PerspectiveCamera，aspect 始终保留容器派生值。 */
  applyCamera(camera: SceneCamera): void {
    this.cameraRoamingSystem?.stopPreview();
    this.cameraRoamingSystem?.cancelDrawing();
    this.cameraSystem?.cancel();
    this.camera.name = camera.name;
    this.camera.position.fromArray(camera.position);
    this.camera.rotation.fromArray([
      ...camera.rotation,
      this.camera.rotation.order,
    ]);
    this.camera.scale.fromArray(camera.scale);
    this.camera.visible = camera.visible;
    this.camera.frustumCulled = camera.frustumCulled;
    const shadowCamera = this.camera as PerspectiveCamera & {
      castShadow: boolean;
      receiveShadow: boolean;
    };
    shadowCamera.castShadow = camera.castShadow;
    shadowCamera.receiveShadow = camera.receiveShadow;
    this.camera.fov = camera.fov;
    this.camera.near = camera.near;
    this.camera.far = camera.far;
    this.camera.updateProjectionMatrix();
    this.controls?.target.fromArray(camera.target);
    // 源站应用/重置 Camera 时不调用 controls.update，否则会立即用 target 覆盖持久化 rotation。
    this.emitCameraState();
    this.emitCameraOrientation();
    this.invalidate();
  }

  getCameraState(): SceneCamera {
    const fallbackTarget = createDefaultSceneCamera().target;
    const shadowCamera = this.camera as PerspectiveCamera & {
      castShadow?: boolean;
      receiveShadow?: boolean;
    };
    return {
      type: 'perspective',
      name: this.camera.name || 'Camera',
      position: this.camera.position.toArray(),
      rotation: [
        this.camera.rotation.x,
        this.camera.rotation.y,
        this.camera.rotation.z,
      ],
      scale: this.camera.scale.toArray(),
      target:
        this.controls?.target.toArray() ??
        ([...fallbackTarget] as SceneCamera['target']),
      visible: this.camera.visible,
      castShadow: shadowCamera.castShadow ?? false,
      receiveShadow: shadowCamera.receiveShadow ?? false,
      frustumCulled: this.camera.frustumCulled,
      fov: this.camera.fov,
      near: this.camera.near,
      far: this.camera.far,
    };
  }

  applyCameraRoamingList(paths: readonly CameraRoamingPath[]): void {
    this.cameraRoamingSystem?.stopPreview();
    this.cameraRoamingSystem?.cancelDrawing();
    this.cameraRoamingList = paths.map((path) => structuredClone(path));
  }

  getCameraRoamingList(): CameraRoamingPath[] {
    return structuredClone(this.cameraRoamingList);
  }

  startCameraRoamingDrawing(): boolean {
    if (!this.cameraRoamingSystem) return false;
    this.pointerLockSystem?.deactivate();
    this.measurementSystem?.end();
    this.cameraSystem?.cancel();
    this.activeModelPart = undefined;
    this.selectionSystem?.setSelection([]);
    this.transformSystem?.setSelection(null);
    this.cameraRoamingSystem.startDrawing();
    return true;
  }

  cancelCameraRoamingDrawing(): void {
    this.cameraRoamingSystem?.cancelDrawing();
  }

  previewCameraRoaming(pathId: string): boolean {
    const path = this.cameraRoamingList.find((item) => item.id === pathId);
    if (!path || !this.cameraRoamingSystem) return false;
    this.pointerLockSystem?.deactivate();
    this.measurementSystem?.end();
    this.cameraSystem?.cancel();
    this.activeModelPart = undefined;
    this.selectionSystem?.setSelection([]);
    this.transformSystem?.setSelection(null);
    return this.cameraRoamingSystem.preview(path);
  }

  stopCameraRoaming(): void {
    this.cameraRoamingSystem?.stopPreview();
  }

  getObject(nodeId: string): Object3D | undefined {
    return this.documentSystem?.getObject(nodeId);
  }

  /** 为宿主场景树提供当前真实 Object3D 层级，不泄漏可写 Three 实例。 */
  getModelStructures(): ModelStructureMap {
    return this.documentSystem?.getModelStructures() ?? {};
  }

  getStats(): SceneStats {
    return (
      this.documentSystem?.getStats() ?? {
        objectCount: 0,
        meshCount: 0,
        vertexCount: 0,
        faceCount: 0,
      }
    );
  }

  setSelection(ids: Iterable<string>, primaryId?: string | null): void {
    // 普通业务选择必须恢复整模高亮，不能继续引用上一加载代次的内部 Mesh。
    const wasModelPartSelected = this.activeModelPart !== undefined;
    this.activeModelPart = undefined;
    this.selectionSystem?.setSelection(ids, primaryId);
    if (wasModelPartSelected) {
      this.transformSystem?.setSelection(
        this.selectionSystem?.getSelection().primaryId ?? null,
      );
    }
  }

  /**
   * 精确高亮模型二级项，但业务主选择仍保持所属 SceneNode。
   * 内部 Mesh 没有持久化变换协议，因此必须主动卸下 TransformControls。
   */
  selectModelPart(nodeId: string, objectId: string): boolean {
    const object = this.documentSystem?.getModelPartObject(nodeId, objectId);
    this.activeModelPart = undefined;
    if (!object) {
      const selection = this.selectionSystem?.getSelection();
      if (selection) {
        this.selectionSystem?.setSelection(selection.ids, selection.primaryId);
        this.transformSystem?.setSelection(selection.primaryId);
      }
      return false;
    }

    // selectionchange 是同步事件；宿主回写业务选择结束后再覆盖为精确 Mesh 高亮。
    this.selectionSystem?.setSelection([nodeId], nodeId);
    this.selectionHighlight?.setObjects([object]);
    this.transformSystem?.setSelection(null);
    this.activeModelPart = { nodeId, objectId, object };
    this.invalidate();
    return true;
  }

  /** 节点增量操作会刷新整模高亮；若内部 UUID 仍有效则恢复精确选择。 */
  private restoreModelPartSelection(selection: {
    nodeId: string;
    objectId: string;
  }): boolean {
    const object = this.documentSystem?.getModelPartObject(
      selection.nodeId,
      selection.objectId,
    );
    if (!object) {
      this.activeModelPart = undefined;
      return false;
    }
    this.selectionHighlight?.setObjects([object]);
    this.transformSystem?.setSelection(null);
    this.activeModelPart = { ...selection, object };
    return true;
  }

  /** 切换源站第一/第三人称模式，并让 OrbitControls 与 PointerLockControls 互斥。 */
  togglePointerLock(): boolean {
    if (!this.pointerLockSystem) return false;
    if (!this.pointerLockSystem.isActive) {
      this.cameraRoamingSystem?.stopPreview();
      this.cameraRoamingSystem?.cancelDrawing();
      this.measurementSystem?.end();
      this.activeModelPart = undefined;
      this.selectionSystem?.setSelection([]);
      this.transformSystem?.setSelection(null);
      this.selectionSystem?.setEnabled(false);
    }
    return this.pointerLockSystem.toggle();
  }

  /** 启停源站两点测量模式，进入时清理当前节点选中和变换手柄。 */
  setMeasurementEnabled(enabled: boolean): boolean {
    if (!this.measurementSystem) return false;
    if (enabled) {
      this.cameraRoamingSystem?.stopPreview();
      this.cameraRoamingSystem?.cancelDrawing();
      this.pointerLockSystem?.deactivate();
      this.activeModelPart = undefined;
      this.selectionSystem?.setSelection([]);
      this.transformSystem?.setSelection(null);
      this.selectionSystem?.setEnabled(false);
      this.measurementSystem.start();
    } else {
      this.measurementSystem.end();
      this.selectionSystem?.setEnabled(!this.pointerLockSystem?.isActive);
    }
    return this.measurementSystem.active;
  }

  setSelectWholeModel(enabled: boolean): void {
    this.selectionSystem?.setSelectWholeModel(enabled);
    this.invalidate();
  }

  /**
   * 对齐文档根节点并返回可写入命令历史的变换差异。
   * 引擎先更新可见对象，宿主随后将同一批差异提交到 SceneDocument。
   */
  alignModelsToGround(): TransformCommit[] {
    if (!this.documentSystem) return [];
    const changes: TransformCommit[] = [];
    for (const object of this.documentSystem.root.children) {
      const nodeId = this.documentSystem.getNodeId(object);
      if (!nodeId || object.userData.isEditorHelper === true) continue;
      const before = snapshotTransform(object);
      const offset = alignObjectToGround(object);
      if (offset === 0) continue;
      changes.push({ nodeId, before, after: snapshotTransform(object) });
    }
    if (changes.length > 0) {
      this.invalidate();
      this.emitStats();
    }
    return changes;
  }

  setTransformMode(mode: TransformControlsMode): void {
    if (this.pointerLockSystem?.isActive) return;
    if (this.measurementSystem?.active) this.setMeasurementEnabled(false);
    this.transformSystem?.setMode(mode);
    this.invalidate();
  }

  setTransformSpace(space: 'local' | 'world'): void {
    this.transformSystem?.setSpace(space);
    this.invalidate();
  }

  setTransformSnap(gridSize: number | null): void {
    this.transformSystem?.setSnap(gridSize);
  }

  getDropPosition(
    clientX: number,
    clientY: number,
    gridSize: number | null = null,
  ): [number, number, number] {
    if (!this.dropSystem) throw new Error('EditorEngine 尚未初始化');
    return this.dropSystem
      .getWorldPosition(clientX, clientY, gridSize)
      .toArray();
  }

  focusSelection(): boolean {
    const activePart = this.activeModelPart?.object;
    const selection = this.selectionSystem?.getSelection();
    const objects = activePart
      ? [activePart]
      : (selection?.ids.flatMap((id) => {
          const object = this.documentSystem?.getObject(id);
          return object ? [object] : [];
        }) ?? []);
    if (objects.length === 0) return false;
    this.cameraSystem?.cancel();

    const bounds = new Box3();
    for (const object of objects) bounds.expandByObject(object, true);
    const sphere = new Sphere();
    if (bounds.isEmpty()) {
      objects[0]?.getWorldPosition(sphere.center);
      sphere.radius = 0.5;
    } else {
      bounds.getBoundingSphere(sphere);
    }
    const target = this.controls?.target ?? new Vector3();
    const direction = this.camera.position.clone().sub(target);
    if (direction.lengthSq() === 0) direction.set(1, 0.6, 1);
    const halfFov = (this.camera.fov * Math.PI) / 360;
    const distance = Math.max(
      sphere.radius / Math.max(Math.sin(halfFov), 0.1),
      2,
    );
    this.camera.position
      .copy(sphere.center)
      .add(direction.normalize().multiplyScalar(distance * 1.25));
    this.controls?.target.copy(sphere.center);
    this.controls?.update();
    this.invalidate();
    return true;
  }

  setCameraView(view: CameraView): void {
    this.cameraRoamingSystem?.stopPreview();
    this.cameraRoamingSystem?.cancelDrawing();
    this.cameraSystem?.setView(view);
    this.invalidate();
  }

  resetCamera(): void {
    this.pointerLockSystem?.deactivate();
    this.measurementSystem?.end();
    this.applyCamera(createDefaultSceneCamera());
  }

  getCameraOrientation(): CameraOrientation {
    return (
      this.cameraSystem?.getOrientation() ?? {
        quaternion: this.camera.quaternion.toArray(),
      }
    );
  }

  /** 在下一次 Composer 写完默认 framebuffer 后立即读取，避免得到透明空图。 */
  captureScreenshot(): Promise<Blob> {
    if (!this.renderer || this.disposed) {
      return Promise.reject(new Error('EditorEngine 尚未初始化'));
    }
    this.invalidate();
    return new Promise<Blob>((resolve, reject) => {
      this.screenshotQueue.push({ resolve, reject });
    });
  }

  /** W/E/R 切换变换工具，F 聚焦当前选择。 */
  handleShortcut(code: string): boolean {
    if (code === 'Escape') {
      const roamingMode = this.cameraRoamingSystem?.getState().mode;
      if (roamingMode === 'drawing') {
        this.cameraRoamingSystem?.cancelDrawing();
        return true;
      }
      if (roamingMode === 'previewing') {
        this.cameraRoamingSystem?.stopPreview();
        return true;
      }
      if (this.measurementSystem?.active) {
        this.setMeasurementEnabled(false);
        return true;
      }
      if (this.pointerLockSystem?.isActive) {
        this.pointerLockSystem.deactivate();
        return true;
      }
    }
    if (this.pointerLockSystem?.isActive || this.measurementSystem?.active) {
      return false;
    }
    if (this.transformSystem?.handleShortcut(code)) {
      this.invalidate();
      return true;
    }
    return code === 'KeyF' ? this.focusSelection() : false;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    if (this.frameId !== undefined) cancelAnimationFrame(this.frameId);
    this.timer.dispose();
    this.resizeObserver?.disconnect();
    this.selectionSystem?.dispose();
    this.measurementSystem?.dispose();
    this.pointerLockSystem?.dispose();
    this.cameraRoamingSystem?.dispose();
    this.selectionHighlight?.dispose();
    this.transformSystem?.dispose();
    this.weatherSystem?.dispose();
    this.groundSystem?.dispose();
    this.settingsSystem?.dispose();
    this.fallbackEnvironmentTarget?.dispose();
    this.fallbackEnvironmentTarget = undefined;
    // Gizmo 订阅 OrbitControls，必须在 controls 前对称释放。
    this.viewportGizmo?.dispose();
    this.controls?.removeEventListener('change', this.invalidate);
    this.controls?.removeEventListener('change', this.emitCameraOrientation);
    this.controls?.removeEventListener('start', this.cancelCameraAnimation);
    this.controls?.removeEventListener('end', this.emitCameraState);
    this.controls?.dispose();
    this.documentSystem?.dispose();
    this.output?.dispose();
    this.composer?.dispose();
    this.resources.dispose();
    const canvas = this.renderer?.domElement;
    this.renderer?.dispose();
    canvas?.remove();
    const reason = new Error('EditorEngine 已销毁，截图请求已取消');
    for (const request of this.screenshotQueue) request.reject(reason);
    for (const request of this.activeScreenshot ?? []) request.reject(reason);
    this.screenshotQueue = [];
    this.activeScreenshot = undefined;
  }

  private ensureSelectionSystem(): void {
    if (!this.documentSystem || !this.renderer || !this.selectionHighlight) {
      return;
    }
    if (!this.selectionSystem) {
      this.selectionSystem = new SelectionSystem({
        camera: this.camera,
        canvas: this.renderer.domElement,
        root: this.documentSystem.root,
        getNodeId: (object) => this.documentSystem?.getNodeId(object),
        getObject: (nodeId) => this.documentSystem?.getObject(nodeId),
        highlight: this.selectionHighlight,
        onSelectionChange: (selection) => {
          // 画布射线选中业务节点后，SelectionSystem 已经恢复了整模包围盒。
          this.activeModelPart = undefined;
          this.transformSystem?.setSelection(selection.primaryId);
          this.dispatchEvent({ type: 'selectionchange', ...selection });
          this.invalidate();
        },
      });
    }
    if (!this.measurementSystem) {
      this.measurementSystem = new MeasurementSystem({
        scene: this.scene,
        root: this.documentSystem.root,
        camera: this.camera,
        canvas: this.renderer.domElement,
        onStateChange: (active) => {
          this.selectionSystem?.setEnabled(
            !active && !this.pointerLockSystem?.isActive,
          );
          this.dispatchEvent({ type: 'measurechange', active });
          this.invalidate();
        },
        onChange: this.invalidate,
      });
    }
  }

  private emitStats(): void {
    this.dispatchEvent({ type: 'statschange', ...this.getStats() });
  }

  private readonly emitCameraOrientation = (): void => {
    this.dispatchEvent({
      type: 'camerachange',
      ...this.getCameraOrientation(),
    });
    this.invalidate();
  };

  private readonly emitCameraState = (): void => {
    this.dispatchEvent({
      type: 'camerastatechange',
      camera: this.getCameraState(),
    });
  };

  private readonly cancelCameraAnimation = (): void => {
    this.cameraSystem?.cancel();
  };

  private emitRenderStatsIfNeeded(): void {
    this.renderStatsFrames += 1;
    const now = performance.now();
    const elapsed = now - this.renderStatsStartedAt;
    if (elapsed < 500) return;
    this.dispatchEvent({
      type: 'renderstatschange',
      fps: Math.round((this.renderStatsFrames * 1_000) / elapsed),
      drawCalls: this.renderer?.info.render.calls ?? 0,
    });
    this.renderStatsStartedAt = now;
    this.renderStatsFrames = 0;
  }

  private flushScreenshotRequests(): void {
    if (
      !this.renderer ||
      this.activeScreenshot ||
      this.screenshotQueue.length === 0
    ) {
      return;
    }
    const requests = this.screenshotQueue.splice(0);
    this.activeScreenshot = requests;
    try {
      this.renderer.domElement.toBlob((blob) => {
        // dispose 可能已拒绝该批次；迟到回调不能再次 resolve。
        if (this.activeScreenshot !== requests) return;
        this.activeScreenshot = undefined;
        if (blob) {
          for (const request of requests) request.resolve(blob);
        } else {
          const reason = new Error('浏览器未能生成视口截图');
          for (const request of requests) request.reject(reason);
        }
        if (this.screenshotQueue.length > 0) this.invalidate();
      }, 'image/png');
    } catch (reason) {
      this.activeScreenshot = undefined;
      const error =
        reason instanceof Error ? reason : new Error('视口截图失败');
      for (const request of requests) request.reject(error);
    }
  }
}
