import type { RuntimeHost } from '@digital-twin/runtime-core';
import type { SceneDocument } from '@digital-twin/scene-schema';
import {
  ACESFilmicToneMapping,
  Clock,
  Color,
  PerspectiveCamera,
  Scene,
  SRGBColorSpace,
  Vector2,
  WebGLRenderer,
} from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { OutlinePass } from 'three/addons/postprocessing/OutlinePass.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { AssetInstanceSystem } from './assets/AssetInstanceSystem.js';
import { AssetLoader } from './assets/AssetLoader.js';
import type { AssetResolver } from './assets/types.js';
import { SceneDocumentSystem } from './documents/SceneDocumentSystem.js';
import { MaterialSystem } from './materials/MaterialSystem.js';
import { RuntimeHostAdapter } from './runtime/RuntimeHostAdapter.js';
import { RuntimePointerSystem } from './runtime/RuntimePointerSystem.js';
import { SceneSettingsSystem } from './settings/SceneSettingsSystem.js';
import type { LoadReport, SceneStats } from './types.js';

/** 发布与预览专用引擎，只拥有运行期渲染、交互和资源生命周期。 */
export class RuntimeThreeEngine {
  readonly scene = new Scene();
  readonly camera = new PerspectiveCamera(50, 1, 0.01, 10_000);
  private readonly clock = new Clock();
  private renderer?: WebGLRenderer;
  private controls?: OrbitControls;
  private composer?: EffectComposer;
  private outline?: OutlinePass;
  private settings?: SceneSettingsSystem;
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
    this.scene.background = new Color('#111827');
    this.camera.position.set(5, 3, 8);

    const renderer = new WebGLRenderer({
      antialias: true,
      powerPreference: 'high-performance',
    });
    renderer.outputColorSpace = SRGBColorSpace;
    renderer.toneMapping = ACESFilmicToneMapping;
    renderer.shadowMap.enabled = true;
    container.append(renderer.domElement);
    this.renderer = renderer;
    this.settings = new SceneSettingsSystem(this.scene, renderer, {
      includeGrid: false,
    });

    const controls = new OrbitControls(this.camera, renderer.domElement);
    controls.target.set(0, 0.5, 0);
    controls.enableDamping = true;
    this.controls = controls;

    const composer = new EffectComposer(renderer);
    composer.addPass(new RenderPass(this.scene, this.camera));
    const outline = new OutlinePass(new Vector2(1, 1), this.scene, this.camera);
    outline.edgeStrength = 4;
    outline.edgeThickness = 1.5;
    outline.visibleEdgeColor.set('#38bdf8');
    composer.addPass(outline);
    this.composer = composer;
    this.outline = outline;

    this.resizeObserver = new ResizeObserver(([entry]) => {
      if (!entry) return;
      this.resize(
        entry.contentRect.width,
        entry.contentRect.height,
        window.devicePixelRatio,
      );
    });
    this.resizeObserver.observe(container);
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
    await this.settings?.applyEnvironment(
      document.settings.environmentAssetId,
      resolver,
    );
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
    this.resizeObserver?.disconnect();
    this.hostAdapter?.dispose();
    this.pointerSystem?.dispose();
    this.controls?.dispose();
    this.documentSystem?.dispose();
    this.settings?.dispose();
    this.composer?.dispose();
    const canvas = this.renderer?.domElement;
    this.renderer?.dispose();
    canvas?.remove();
  }

  private readonly loop = (): void => {
    if (this.disposed) return;
    this.frameId = requestAnimationFrame(this.loop);
    const delta = this.clock.getDelta();
    this.controls?.update(delta);
    this.hostAdapter?.update(delta);
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
