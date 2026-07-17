import type { RuntimeHost } from '@digital-twin/runtime-core';
import type { SceneDocument } from '@digital-twin/scene-schema';
import {
  Color,
  NeutralToneMapping,
  PCFShadowMap,
  PerspectiveCamera,
  PMREMGenerator,
  Scene,
  SRGBColorSpace,
  Timer,
  Vector2,
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
import { SceneDocumentSystem } from './documents/SceneDocumentSystem.js';
import { configureOrbitControls } from './interaction/OrbitControlsProfile.js';
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

/** 发布与预览专用引擎，只拥有运行期渲染、交互和资源生命周期。 */
export class RuntimeThreeEngine {
  readonly scene = new Scene();
  readonly camera = new PerspectiveCamera(50, 1, 0.01, 10_000);
  private readonly timer = new Timer();
  private renderer?: WebGLRenderer;
  private controls?: OrbitControls;
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
    this.camera.position.set(5, 3, 8);

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

  resize(width: number, height: number, dpr: number): void {
    if (!this.renderer || !this.composer || width <= 0 || height <= 0) return;
    const pixelRatio = Math.min(dpr, 2);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setPixelRatio(pixelRatio);
    this.renderer.setSize(width, height, false);
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
  }

  private readonly loop = (timestamp?: number): void => {
    if (this.disposed) return;
    this.frameId = requestAnimationFrame(this.loop);
    this.timer.update(timestamp);
    const delta = this.timer.getDelta();
    const elapsed = this.timer.getElapsed();
    this.controls?.update(delta);
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
    this.hostAdapter?.dispose();
    this.hostAdapter = new RuntimeHostAdapter({
      getObject: (nodeId) => this.documentSystem?.getObject(nodeId),
      camera: this.camera,
      controls: this.controls,
      outline: this.outline,
      subscribeNodeEvent: (nodeId, event, listener) =>
        this.pointerSystem!.subscribe(nodeId, event, listener),
    });
  }
}
