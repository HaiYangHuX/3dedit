import {
  AmbientLight,
  Box3,
  Clock,
  Color,
  EventDispatcher,
  PerspectiveCamera,
  Scene,
  Sphere,
  SRGBColorSpace,
  Vector2,
  Vector3,
  WebGLRenderer,
  type Object3D,
} from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import type { TransformControlsMode } from 'three/addons/controls/TransformControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { OutlinePass } from 'three/addons/postprocessing/OutlinePass.js';
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
import {
  TransformSystem,
  type TransformCommit,
} from './interaction/TransformSystem.js';
import { ViewportDropSystem } from './interaction/ViewportDropSystem.js';
import { ResourceTracker } from './ResourceTracker';
import type { LoadReport, SceneStats } from './types.js';

export interface EditorEngineEventMap {
  selectionchange: SelectionState;
  transformstart: { nodeId: string; before: Transform };
  transformchange: { nodeId: string; transform: Transform };
  transformend: TransformCommit;
  statschange: SceneStats;
}

/**
 * 统一拥有场景渲染循环、容器尺寸监听、控制器、后期通道和 GPU 资源。
 * 调用方必须在组件卸载时执行 dispose，不能单独销毁其中任意成员。
 */
export class EditorEngine extends EventDispatcher<EditorEngineEventMap> {
  readonly scene = new Scene();
  readonly camera = new PerspectiveCamera(50, 1, 0.01, 10_000);
  private readonly clock = new Clock();
  private readonly resources = new ResourceTracker();
  private renderer?: WebGLRenderer;
  private controls?: OrbitControls;
  private composer?: EffectComposer;
  private outline?: OutlinePass;
  private documentSystem?: SceneDocumentSystem;
  private selectionSystem?: SelectionSystem;
  private transformSystem?: TransformSystem;
  private dropSystem?: ViewportDropSystem;
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
    this.documentSystem?.removeNodes(removing);
    const selection = this.selectionSystem?.getSelection();
    if (selection) {
      this.selectionSystem?.setSelection(selection.ids, selection.primaryId);
    }
    this.emitStats();
    this.invalidate();
  }

  updateNode(node: SceneNode): void {
    this.documentSystem?.updateNode(node);
    const selection = this.selectionSystem?.getSelection();
    if (selection?.primaryId === node.id) {
      // 锁定状态可由属性面板实时修改，手柄 attach 状态必须同步刷新。
      this.transformSystem?.setSelection(selection.primaryId);
    }
    this.emitStats();
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
    this.resizeObserver?.disconnect();
    this.selectionSystem?.dispose();
    this.transformSystem?.dispose();
    this.controls?.removeEventListener('change', this.invalidate);
    this.controls?.dispose();
    this.documentSystem?.dispose();
    this.composer?.dispose();
    this.resources.dispose();
    const canvas = this.renderer?.domElement;
    this.renderer?.dispose();
    canvas?.remove();
  }

  private ensureSelectionSystem(): void {
    if (
      this.selectionSystem ||
      !this.documentSystem ||
      !this.renderer ||
      !this.outline
    ) {
      return;
    }
    this.selectionSystem = new SelectionSystem({
      camera: this.camera,
      canvas: this.renderer.domElement,
      root: this.documentSystem.root,
      getNodeId: (object) => this.documentSystem?.getNodeId(object),
      getObject: (nodeId) => this.documentSystem?.getObject(nodeId),
      outline: this.outline,
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
}
