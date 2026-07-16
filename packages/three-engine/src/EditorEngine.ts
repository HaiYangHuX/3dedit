import {
  AmbientLight,
  Clock,
  Color,
  PerspectiveCamera,
  Scene,
  SRGBColorSpace,
  Vector2,
  WebGLRenderer,
  type Object3D,
} from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { OutlinePass } from 'three/addons/postprocessing/OutlinePass.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import type { SceneDocument, SceneNode } from '@digital-twin/scene-schema';
import { AssetInstanceSystem } from './assets/AssetInstanceSystem.js';
import { AssetLoader } from './assets/AssetLoader.js';
import type { AssetResolver } from './assets/types.js';
import { SceneDocumentSystem } from './documents/SceneDocumentSystem.js';
import { ResourceTracker } from './ResourceTracker';
import type { LoadReport, SceneStats } from './types.js';

/**
 * 统一拥有场景渲染循环、容器尺寸监听、控制器、后期通道和 GPU 资源。
 * 调用方必须在组件卸载时执行 dispose，不能单独销毁其中任意成员。
 */
export class EditorEngine {
  readonly scene = new Scene();
  readonly camera = new PerspectiveCamera(50, 1, 0.01, 10_000);
  private readonly clock = new Clock();
  private readonly resources = new ResourceTracker();
  private renderer?: WebGLRenderer;
  private controls?: OrbitControls;
  private composer?: EffectComposer;
  private outline?: OutlinePass;
  private documentSystem?: SceneDocumentSystem;
  private assetResolver?: AssetResolver;
  private resizeObserver?: ResizeObserver;
  private frameId?: number;
  private invalidated = true;
  private disposed = false;

  async initialize(container: HTMLElement): Promise<void> {
    if (this.renderer) throw new Error('EditorEngine 已初始化');
    if (this.disposed) throw new Error('已销毁的 EditorEngine 不能重新初始化');

    this.scene.background = new Color('#111827');
    // 编辑器辅助环境光不属于 SceneDocument，确保新建场景中的 PBR 模型仍可辨认。
    const helperLight = new AmbientLight('#ffffff', 0.8);
    helperLight.userData.editorHelper = true;
    this.scene.add(helperLight);
    this.camera.position.set(5, 3, 8);

    const renderer = new WebGLRenderer({
      antialias: true,
      powerPreference: 'high-performance',
    });
    renderer.outputColorSpace = SRGBColorSpace;
    renderer.shadowMap.enabled = true;
    container.append(renderer.domElement);
    this.renderer = renderer;

    this.controls = new OrbitControls(this.camera, renderer.domElement);
    this.controls.target.set(0, 0.5, 0);
    this.controls.addEventListener('change', this.invalidate);

    this.composer = new EffectComposer(renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.outline = new OutlinePass(new Vector2(1, 1), this.scene, this.camera);
    this.composer.addPass(this.outline);

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
    this.outline?.setSize(width, height);
    this.invalidate();
  }

  private readonly loop = (): void => {
    if (this.disposed) return;
    this.frameId = requestAnimationFrame(this.loop);
    const delta = this.clock.getDelta();
    this.controls?.update(delta);
    if (!this.invalidated) return;

    // Composer 是启用后期处理时唯一的最终渲染路径，不能再调用 renderer.render。
    this.composer?.render(delta);
    this.invalidated = false;
  };

  track(root: Parameters<ResourceTracker['track']>[0]): void {
    this.resources.track(root);
  }

  async loadDocument(
    document: SceneDocument,
    resolver: AssetResolver,
  ): Promise<LoadReport> {
    if (!this.renderer) throw new Error('EditorEngine 尚未初始化');
    if (!this.documentSystem || resolver !== this.assetResolver) {
      this.documentSystem?.dispose();
      const loader = new AssetLoader({ renderer: this.renderer });
      this.documentSystem = new SceneDocumentSystem(
        this.scene,
        new AssetInstanceSystem(resolver, loader),
      );
      this.assetResolver = resolver;
    }
    const report = await this.documentSystem.loadDocument(document);
    this.invalidate();
    return report;
  }

  addNode(node: SceneNode): Promise<Object3D> {
    if (!this.documentSystem) throw new Error('尚未加载场景文档');
    return this.documentSystem.addNode(node).then((object) => {
      this.invalidate();
      return object;
    });
  }

  removeNodes(ids: Iterable<string>): void {
    this.documentSystem?.removeNodes(ids);
    this.invalidate();
  }

  updateNode(node: SceneNode): void {
    this.documentSystem?.updateNode(node);
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

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    if (this.frameId !== undefined) cancelAnimationFrame(this.frameId);
    this.resizeObserver?.disconnect();
    this.controls?.removeEventListener('change', this.invalidate);
    this.controls?.dispose();
    this.documentSystem?.dispose();
    this.composer?.dispose();
    this.resources.dispose();
    const canvas = this.renderer?.domElement;
    this.renderer?.dispose();
    canvas?.remove();
  }
}
