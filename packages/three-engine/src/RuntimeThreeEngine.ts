import type { RuntimeHost } from '@digital-twin/runtime-core';
import {
  createDefaultSceneCamera,
  type CameraRoamingPath,
  type SceneCamera,
  type SceneDocument,
} from '@digital-twin/scene-schema';
import {
  Box3,
  Color,
  NeutralToneMapping,
  PCFShadowMap,
  PerspectiveCamera,
  PMREMGenerator,
  Scene,
  Sphere,
  SRGBColorSpace,
  Timer,
  Vector2,
  Vector3,
  WebGLRenderer,
} from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { HDRLoader } from 'three/addons/loaders/HDRLoader.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { OutlinePass } from 'three/addons/postprocessing/OutlinePass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { AssetInstanceSystem } from './assets/AssetInstanceSystem.js';
import { AssetLoader } from './assets/AssetLoader.js';
import type { AssetResolver } from './assets/types.js';
import { CameraRoamingSystem } from './camera/CameraRoamingSystem.js';
import { SceneDocumentSystem } from './documents/SceneDocumentSystem.js';
import { configureOrbitControls } from './interaction/OrbitControlsProfile.js';
import { PointerLockSystem } from './interaction/PointerLockSystem.js';
import { MaterialSystem } from './materials/MaterialSystem.js';
import { RuntimeHostAdapter } from './runtime/RuntimeHostAdapter.js';
import { RuntimePointerSystem } from './runtime/RuntimePointerSystem.js';
import { BUILTIN_ENVIRONMENT_URL } from './settings/builtinAssets.js';
import { GroundSystem } from './settings/GroundSystem.js';
import {
  SceneSettingsSystem,
  type EnvironmentMapTarget,
} from './settings/SceneSettingsSystem.js';
import { loadEditorEnvironment } from './settings/loadEditorEnvironment.js';
import { WeatherSystem } from './settings/WeatherSystem.js';
import type { LoadReport, SceneStats } from './types.js';

export type RuntimeNavigationMode = 'orbit' | 'first-person' | 'roaming';

export interface RuntimeNavigationState {
  mode: RuntimeNavigationMode;
  paths: CameraRoamingPath[];
  activePathId: string | null;
}

export type RuntimeNavigationListener = (state: RuntimeNavigationState) => void;

/** 发布与预览专用引擎，只拥有运行期渲染、交互和资源生命周期。 */
export class RuntimeThreeEngine {
  readonly scene = new Scene();
  readonly camera = new PerspectiveCamera(45, 1, 0.05, 20_000);
  private readonly timer = new Timer();
  private renderer?: WebGLRenderer;
  private controls?: OrbitControls;
  private pointerLockSystem?: PointerLockSystem;
  private cameraRoamingSystem?: CameraRoamingSystem;
  private cameraRoamingList: CameraRoamingPath[] = [];
  private initialCamera: SceneCamera = createDefaultSceneCamera();
  private readonly navigationListeners = new Set<RuntimeNavigationListener>();
  private composer?: EffectComposer;
  private outline?: OutlinePass;
  private output?: OutputPass;
  private settings?: SceneSettingsSystem;
  private groundSystem?: GroundSystem;
  private weatherSystem?: WeatherSystem;
  private fallbackEnvironmentTarget?: EnvironmentMapTarget;
  private documentSystem?: SceneDocumentSystem;
  private pointerSystem?: RuntimePointerSystem;
  private hostAdapter?: RuntimeHostAdapter;
  private assetResolver?: AssetResolver;
  private resizeObserver?: ResizeObserver;
  private frameId?: number;
  private disposed = false;

  async initialize(container: HTMLElement): Promise<void> {
    if (this.renderer) throw new Error('RuntimeThreeEngine 已初始化');
    if (this.disposed) throw new Error('已销毁的运行时引擎不能重新初始化');
    this.scene.background = new Color('#3b3b3b');
    this.camera.position.fromArray(this.initialCamera.position);
    this.camera.rotation.fromArray(this.initialCamera.rotation);

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
    let fallbackEnvironmentTarget: EnvironmentMapTarget | undefined;
    let defaultEnvironmentError: unknown;
    try {
      fallbackEnvironmentTarget = await loadEditorEnvironment(
        BUILTIN_ENVIRONMENT_URL,
        {
          loader: new HDRLoader(),
          generator: environmentGenerator,
          isStale: () => this.disposed,
        },
      );
    } catch (error) {
      defaultEnvironmentError = error;
    }
    if (this.disposed) {
      fallbackEnvironmentTarget?.dispose();
      environmentGenerator.dispose();
      return;
    }
    if (!fallbackEnvironmentTarget) {
      // 发布端与编辑器使用同一降级路径，避免 HDR 异常时再次出现白模。
      const roomEnvironment = new RoomEnvironment();
      try {
        fallbackEnvironmentTarget =
          environmentGenerator.fromScene(roomEnvironment);
      } finally {
        roomEnvironment.dispose();
      }
      if (defaultEnvironmentError) {
        console.warn(
          '默认 Venice HDR 加载失败，发布端已降级使用 RoomEnvironment',
          defaultEnvironmentError,
        );
      }
    }
    this.fallbackEnvironmentTarget = fallbackEnvironmentTarget;
    this.scene.environmentRotation.set(0, Math.PI / 2, 0);
    this.settings = new SceneSettingsSystem(this.scene, renderer, {
      includeGrid: false,
      fallbackEnvironment: fallbackEnvironmentTarget.texture,
      environmentGenerator,
    });
    this.groundSystem = new GroundSystem(this.scene);
    this.weatherSystem = new WeatherSystem(this.scene);

    const controls = new OrbitControls(this.camera, renderer.domElement);
    // 预览与发布端沿用编辑器按键映射，避免同一场景在两端手感相反。
    configureOrbitControls(controls, { enablePan: true });
    this.controls = controls;
    controls.target.fromArray(this.initialCamera.target);
    this.pointerLockSystem = new PointerLockSystem(
      this.camera,
      renderer.domElement,
      {
        onStateChange: (active) => {
          controls.enabled =
            !active &&
            this.cameraRoamingSystem?.getState().mode !== 'previewing';
          this.pointerSystem?.setEnabled(!active);
          this.emitNavigationState();
        },
      },
    );
    this.cameraRoamingSystem = new CameraRoamingSystem({
      scene: this.scene,
      camera: this.camera,
      canvas: renderer.domElement,
      controls,
      invalidate: () => undefined,
      onStateChange: (state) => {
        this.pointerSystem?.setEnabled(
          state.mode === 'idle' && !this.pointerLockSystem?.isActive,
        );
        this.emitNavigationState();
      },
    });

    const composer = new EffectComposer(renderer);
    composer.addPass(new RenderPass(this.scene, this.camera));
    const outline = new OutlinePass(new Vector2(1, 1), this.scene, this.camera);
    outline.edgeStrength = 4;
    outline.edgeThickness = 1.5;
    outline.visibleEdgeColor.set('#38bdf8');
    composer.addPass(outline);
    // 运行时与编辑器共享 r183 颜色输出规则，避免发布画面再次被当成线性色显示。
    const output = new OutputPass();
    composer.addPass(output);
    this.composer = composer;
    this.outline = outline;
    this.output = output;

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
    this.loop();
  }

  async loadDocument(
    document: SceneDocument,
    resolver: AssetResolver,
  ): Promise<LoadReport> {
    if (!this.renderer || !this.outline) {
      throw new Error('RuntimeThreeEngine 尚未初始化');
    }
    this.exitFirstPerson();
    this.stopCameraRoaming();
    this.applyCameraRoamingList(document.cameraRoamingList);
    this.applyCamera(document.camera);
    // OrbitControls 内部缓存球面坐标；文档相机异步加载后必须立即同步一次，
    // 否则首帧会用初始化前的缓存姿态覆盖保存的 rotation/target，模型看似“消失”。
    this.controls?.update();
    this.settings?.apply(document.settings);
    // 先停止旧文档动画和补间，模型异步加载期间不能继续修改已移除的 Object3D。
    this.hostAdapter?.dispose();
    this.hostAdapter = undefined;
    await Promise.all([
      this.settings?.applyBackground(document.settings, resolver),
      this.settings?.applyEnvironment(document.settings, resolver),
      this.groundSystem?.apply(document.settings.groundType),
      this.weatherSystem?.apply(document.settings),
    ]);
    if (!this.documentSystem || resolver !== this.assetResolver) {
      this.pointerSystem?.dispose();
      this.pointerSystem = undefined;
      this.documentSystem?.dispose();
      this.documentSystem = new SceneDocumentSystem(
        this.scene,
        new AssetInstanceSystem(
          resolver,
          new AssetLoader({ renderer: this.renderer }),
        ),
        new MaterialSystem(resolver),
      );
      this.assetResolver = resolver;
    }
    const report = await this.documentSystem.loadDocument(document);
    this.ensureRuntimePort();
    return report;
  }

  createHost(): RuntimeHost {
    if (!this.hostAdapter) throw new Error('运行时场景尚未加载');
    return this.hostAdapter;
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

  /** Runtime reset 回到当前文档定义的初始 Camera，而不是硬编码另一个发布端视角。 */
  applyCamera(camera: SceneCamera): void {
    this.initialCamera = structuredClone(camera);
    this.camera.name = camera.name;
    this.camera.position.fromArray(camera.position);
    this.camera.rotation.fromArray(camera.rotation);
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
  }

  applyCameraRoamingList(paths: readonly CameraRoamingPath[]): void {
    this.stopCameraRoaming();
    this.cameraRoamingList = paths.map((path) => structuredClone(path));
    this.emitNavigationState();
  }

  resetCamera(): void {
    this.exitFirstPerson();
    this.stopCameraRoaming();
    this.applyCamera(this.initialCamera);
    this.controls?.update();
  }

  /** 根据已加载文档的包围盒取景，保持当前视线方向，只重新计算目标和距离。 */
  fitDocumentCamera(): boolean {
    if (!this.controls) return false;
    const root = this.documentSystem?.root;
    if (!root || root.children.length === 0) return false;
    this.scene.updateMatrixWorld(true);
    const bounds = new Box3().setFromObject(root);
    if (bounds.isEmpty()) return false;
    const center = bounds.getCenter(new Vector3());
    const sphere = bounds.getBoundingSphere(new Sphere());
    const offset = this.camera.position.clone().sub(this.controls.target);
    if (offset.lengthSq() < 1e-8) offset.set(0.4, 0.35, 1);
    offset.normalize();
    const halfFov = (this.camera.fov * Math.PI) / 360;
    // 源站 Preview 的固定 Camera 与模型原始尺度约保持 2.2 倍包围球距离；
    // 归一化模型沿用同一视野比例，避免首次打开时贴脸或缩成不可识别的细线。
    const distance = Math.max((sphere.radius / Math.sin(halfFov)) * 2.2, 0.5);
    this.controls.target.copy(center);
    this.camera.position.copy(center).addScaledVector(offset, distance);
    this.camera.lookAt(center);
    this.camera.updateProjectionMatrix();
    this.controls.update();
    // 预览工具栏的“重置”应回到这次可见的初始取景，而不是回到尚未适配模型尺度的旧 Camera。
    this.initialCamera = this.captureCameraState();
    return true;
  }

  requestFirstPerson(): boolean {
    if (!this.pointerLockSystem) return false;
    this.stopCameraRoaming();
    this.pointerLockSystem.activate();
    this.pointerSystem?.setEnabled(false);
    this.emitNavigationState();
    return this.pointerLockSystem.isActive;
  }

  exitFirstPerson(): void {
    this.pointerLockSystem?.deactivate();
    this.pointerSystem?.setEnabled(
      this.cameraRoamingSystem?.getState().mode !== 'previewing',
    );
    this.emitNavigationState();
  }

  playCameraRoaming(pathId: string): boolean {
    const path = this.cameraRoamingList.find((item) => item.id === pathId);
    if (!path || !this.cameraRoamingSystem) return false;
    this.exitFirstPerson();
    const started = this.cameraRoamingSystem.preview(path);
    this.pointerSystem?.setEnabled(!started);
    this.emitNavigationState();
    return started;
  }

  stopCameraRoaming(): void {
    this.cameraRoamingSystem?.stopPreview();
    this.pointerSystem?.setEnabled(!this.pointerLockSystem?.isActive);
    this.emitNavigationState();
  }

  getNavigationState(): RuntimeNavigationState {
    const roaming = this.cameraRoamingSystem?.getState();
    return {
      mode:
        roaming?.mode === 'previewing'
          ? 'roaming'
          : this.pointerLockSystem?.isActive
            ? 'first-person'
            : 'orbit',
      paths: structuredClone(this.cameraRoamingList),
      activePathId: roaming?.activePathId ?? null,
    };
  }

  subscribeNavigation(listener: RuntimeNavigationListener): () => void {
    this.navigationListeners.add(listener);
    listener(this.getNavigationState());
    return () => this.navigationListeners.delete(listener);
  }

  resize(width: number, height: number, dpr: number): void {
    if (!this.renderer || !this.composer || width <= 0 || height <= 0) return;
    const pixelRatio = Math.min(dpr, 2);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setPixelRatio(pixelRatio);
    this.renderer.setSize(width, height, false);
    // updateStyle=false 保留物理像素尺寸控制，但动态创建的 canvas 不会继承 Vue scoped CSS；
    // 显式锁定 CSS 尺寸，避免 DPR=2 时画布以 2560×1440 CSS 像素溢出 1280×720 容器。
    this.renderer.domElement.style.width = '100%';
    this.renderer.domElement.style.height = '100%';
    this.composer.setPixelRatio(pixelRatio);
    this.composer.setSize(width, height);
    this.outline?.setSize(width, height);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    if (this.frameId !== undefined) cancelAnimationFrame(this.frameId);
    this.timer.dispose();
    this.resizeObserver?.disconnect();
    this.hostAdapter?.dispose();
    this.pointerSystem?.dispose();
    this.cameraRoamingSystem?.dispose();
    this.pointerLockSystem?.dispose();
    this.controls?.dispose();
    this.documentSystem?.dispose();
    this.weatherSystem?.dispose();
    this.groundSystem?.dispose();
    this.settings?.dispose();
    this.fallbackEnvironmentTarget?.dispose();
    this.fallbackEnvironmentTarget = undefined;
    this.outline?.dispose();
    this.output?.dispose();
    this.composer?.dispose();
    const canvas = this.renderer?.domElement;
    this.renderer?.dispose();
    canvas?.remove();
    this.navigationListeners.clear();
  }

  private readonly loop = (timestamp?: number): void => {
    if (this.disposed) return;
    this.frameId = requestAnimationFrame(this.loop);
    this.timer.update(timestamp);
    const delta = this.timer.getDelta();
    const elapsed = this.timer.getElapsed();
    const roamingChanged = this.cameraRoamingSystem?.update(delta) ?? false;
    const roamingActive =
      this.cameraRoamingSystem?.getState().mode === 'previewing';
    if (!roamingActive && !roamingChanged) {
      if (this.pointerLockSystem?.isLocked) {
        this.pointerLockSystem.update(delta);
      } else {
        this.controls?.update(delta);
      }
    }
    this.hostAdapter?.update(delta);
    this.groundSystem?.update(elapsed);
    this.weatherSystem?.update(delta, elapsed);
    // 后期管线启用后由 Composer 唯一写入 canvas，避免同一帧重复渲染。
    this.composer?.render(delta);
  };

  private ensureRuntimePort(): void {
    if (
      !this.documentSystem ||
      !this.renderer ||
      !this.outline ||
      !this.controls
    ) {
      return;
    }
    if (!this.pointerSystem) {
      this.pointerSystem = new RuntimePointerSystem({
        camera: this.camera,
        canvas: this.renderer.domElement,
        root: this.documentSystem.root,
        getNodeId: (object) => this.documentSystem?.getNodeId(object),
        orbitControls: this.controls,
      });
    }
    this.pointerSystem.setEnabled(
      !this.pointerLockSystem?.isActive &&
        this.cameraRoamingSystem?.getState().mode !== 'previewing',
    );
    this.hostAdapter?.dispose();
    this.hostAdapter = new RuntimeHostAdapter({
      getObject: (nodeId) => this.documentSystem?.getObject(nodeId),
      camera: this.camera,
      controls: this.controls,
      outline: this.outline,
      beforeCameraChange: () => {
        // CameraMove/focus-node 与漫游、第一人称都写同一个 Camera，动作开始前必须先完成模式仲裁。
        this.exitFirstPerson();
        this.stopCameraRoaming();
        this.controls!.enabled = true;
      },
      subscribeNodeEvent: (nodeId, event, listener) =>
        this.pointerSystem!.subscribe(nodeId, event, listener),
    });
  }

  /** 将运行期 Camera 快照转换回可持久化 DTO，避免 reset 依赖 Three 实例引用。 */
  private captureCameraState(): SceneCamera {
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
      target: this.controls?.target.toArray() ?? [0, 0.5, 0],
      visible: this.camera.visible,
      castShadow: shadowCamera.castShadow ?? false,
      receiveShadow: shadowCamera.receiveShadow ?? false,
      frustumCulled: this.camera.frustumCulled,
      fov: this.camera.fov,
      near: this.camera.near,
      far: this.camera.far,
    };
  }

  private emitNavigationState(): void {
    const state = this.getNavigationState();
    for (const listener of this.navigationListeners) listener(state);
  }
}
