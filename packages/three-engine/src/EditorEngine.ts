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
  SceneDocument,
  SceneNode,
  Transform,
} from '@digital-twin/scene-schema';
import { AssetInstanceSystem } from './assets/AssetInstanceSystem.js';
import { AssetLoader } from './assets/AssetLoader.js';
import type { AssetResolver } from './assets/types.js';
import { SceneDocumentSystem } from './documents/SceneDocumentSystem.js';
import {
  SelectionSystem,
  type SelectionState,
} from './interaction/SelectionSystem.js';
import { SelectionBoxSystem } from './interaction/SelectionBoxSystem.js';
import {
  configureOrbitControls,
  updateOrbitControlsDistanceLimit,
} from './interaction/OrbitControlsProfile.js';
import {
  TransformSystem,
  type TransformCommit,
} from './interaction/TransformSystem.js';
import {
  ViewportCameraSystem,
  type CameraOrientation,
  type CameraView,
} from './interaction/ViewportCameraSystem.js';
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
import type { LoadReport, RenderStats, SceneStats } from './types.js';

export const DEFAULT_EDITOR_ENVIRONMENT_URL = BUILTIN_ENVIRONMENT_URL;

export interface EditorEngineOptions {
  /** 传入 null 可跳过本地 HDR，主要用于宿主自定义或故障诊断。 */
  defaultEnvironmentUrl?: string | null;
}

interface ScreenshotRequest {
  resolve(blob: Blob): void;
  reject(reason: Error): void;
}

export interface EditorEngineEventMap {
  selectionchange: SelectionState;
  transformstart: { nodeId: string; before: Transform };
  transformchange: { nodeId: string; transform: Transform };
  transformend: TransformCommit;
  statschange: SceneStats;
  camerachange: CameraOrientation;
  renderstatschange: RenderStats;
}

/**
 * 统一拥有场景渲染循环、容器尺寸监听、控制器、后期通道和 GPU 资源。
 * 调用方必须在组件卸载时执行 dispose，不能单独销毁其中任意成员。
 */
export class EditorEngine extends EventDispatcher<EditorEngineEventMap> {
  readonly scene = new Scene();
  readonly camera = new PerspectiveCamera(50, 1, 0.01, 10_000);
  private readonly timer = new Timer();
  private readonly resources = new ResourceTracker();
  private renderer?: WebGLRenderer;
  private controls?: OrbitControls;
  private composer?: EffectComposer;
  private output?: OutputPass;
  private documentSystem?: SceneDocumentSystem;
  private selectionSystem?: SelectionSystem;
  private selectionHighlight?: SelectionBoxSystem;
  private transformSystem?: TransformSystem;
  private dropSystem?: ViewportDropSystem;
  private cameraSystem?: ViewportCameraSystem;
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
    // 源站重置相机使用 (0, 2, 6)，target 位于世界原点，避免初始拖动绕着地面偏心旋转。
    this.camera.position.set(0, 2, 6);

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
    // 核心编辑器对应源站 renderModel.js，左键旋转/滚轮缩放但不允许平移漂移观察中心。
    configureOrbitControls(this.controls, { enablePan: false });
    this.controls.addEventListener('change', this.invalidate);
    this.controls.addEventListener('change', this.emitCameraOrientation);
    this.controls.addEventListener('start', this.cancelCameraAnimation);
    this.cameraSystem = new ViewportCameraSystem(this.camera, this.controls);
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
    const cameraAnimating = this.cameraSystem?.update(delta) ?? false;
    if (!cameraAnimating) this.controls?.update(delta);
    if (cameraAnimating) this.invalidated = true;
    this.emitRenderStatsIfNeeded();
    if (!this.invalidated) return;

    this.selectionHighlight?.update();
    // Composer 是启用后期处理时唯一的最终渲染路径，不能再调用 renderer.render。
    this.composer?.render(delta);
    this.invalidated = false;
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
    this.settingsSystem?.apply(document.settings);
    await Promise.all([
      this.settingsSystem?.applyBackground(document.settings, resolver),
      this.settingsSystem?.applyEnvironment(document.settings, resolver),
      this.groundSystem?.apply(document.settings.groundType),
      this.weatherSystem?.apply(document.settings),
    ]);
    this.selectionSystem?.setSelection([]);
    this.transformSystem?.setSelection(null);
    if (!this.documentSystem || resolver !== this.assetResolver) {
      this.selectionSystem?.dispose();
      this.selectionSystem = undefined;
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
    updateOrbitControlsDistanceLimit(this.controls!, this.documentSystem.root);
    this.ensureSelectionSystem();
    this.emitStats();
    this.invalidate();
    return report;
  }

  addNode(node: SceneNode): Promise<Object3D> {
    if (!this.documentSystem) throw new Error('尚未加载场景文档');
    return this.documentSystem.addNode(node).then((object) => {
      updateOrbitControlsDistanceLimit(
        this.controls!,
        this.documentSystem!.root,
      );
      this.emitStats();
      this.invalidate();
      return object;
    });
  }

  removeNodes(ids: Iterable<string>): void {
    const removing = [...ids];
    this.documentSystem?.removeNodes(removing);
    if (this.documentSystem && this.controls) {
      updateOrbitControlsDistanceLimit(this.controls, this.documentSystem.root);
    }
    const selection = this.selectionSystem?.getSelection();
    if (selection) {
      this.selectionSystem?.setSelection(selection.ids, selection.primaryId);
    }
    this.emitStats();
    this.invalidate();
  }

  async updateNode(node: SceneNode): Promise<void> {
    await this.documentSystem?.updateNode(node);
    if (this.documentSystem && this.controls) {
      updateOrbitControlsDistanceLimit(this.controls, this.documentSystem.root);
    }
    const selection = this.selectionSystem?.getSelection();
    if (selection?.ids.includes(node.id)) {
      this.selectionSystem?.setSelection(selection.ids, selection.primaryId);
    }
    if (selection?.primaryId === node.id) {
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

  getObject(nodeId: string): Object3D | undefined {
    return this.documentSystem?.getObject(nodeId);
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
    this.selectionSystem?.setSelection(ids, primaryId);
  }

  setTransformMode(mode: TransformControlsMode): void {
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
    const selection = this.selectionSystem?.getSelection();
    if (!selection || selection.ids.length === 0) return false;
    const objects = selection.ids.flatMap((id) => {
      const object = this.documentSystem?.getObject(id);
      return object ? [object] : [];
    });
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
    this.cameraSystem?.setView(view);
    this.invalidate();
  }

  resetCamera(): void {
    this.cameraSystem?.reset();
    this.invalidate();
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
    this.selectionHighlight?.dispose();
    this.transformSystem?.dispose();
    this.weatherSystem?.dispose();
    this.groundSystem?.dispose();
    this.settingsSystem?.dispose();
    this.fallbackEnvironmentTarget?.dispose();
    this.fallbackEnvironmentTarget = undefined;
    this.controls?.removeEventListener('change', this.invalidate);
    this.controls?.removeEventListener('change', this.emitCameraOrientation);
    this.controls?.removeEventListener('start', this.cancelCameraAnimation);
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
    if (
      this.selectionSystem ||
      !this.documentSystem ||
      !this.renderer ||
      !this.selectionHighlight
    ) {
      return;
    }
    this.selectionSystem = new SelectionSystem({
      camera: this.camera,
      canvas: this.renderer.domElement,
      root: this.documentSystem.root,
      getNodeId: (object) => this.documentSystem?.getNodeId(object),
      getObject: (nodeId) => this.documentSystem?.getObject(nodeId),
      highlight: this.selectionHighlight,
      orbitControls: this.controls,
      onSelectionChange: (selection) => {
        this.transformSystem?.setSelection(selection.primaryId);
        this.dispatchEvent({ type: 'selectionchange', ...selection });
        this.invalidate();
      },
    });
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
