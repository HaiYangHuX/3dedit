import type { SceneDocument, SceneNode } from '@digital-twin/scene-schema';
import { Group, Light, Mesh, type Object3D, type Scene } from 'three';
import { StaleAssetLoadError } from '../assets/AssetInstanceSystem.js';
import { disposeObject3D } from '../ResourceTracker.js';
import {
  applySceneNode,
  createPrimitiveGeometry,
  createSceneObject,
} from '../objects/createSceneObject.js';
import type {
  AssetInstanceProvider,
  LoadReport,
  SceneStats,
} from '../types.js';

/** 维护 SceneNode ID 与 Three Object3D 的映射及场景切换资源边界。 */
export class SceneDocumentSystem {
  readonly root = new Group();
  private readonly objects = new Map<string, Object3D>();
  private loadVersion = 0;
  private generation = 0;
  private disposed = false;

  constructor(
    scene: Scene,
    private readonly assets: AssetInstanceProvider,
  ) {
    this.root.name = '__scene_document_root__';
    this.root.userData.isDocumentRoot = true;
    scene.add(this.root);
  }

  async loadDocument(document: SceneDocument): Promise<LoadReport> {
    const version = ++this.loadVersion;
    this.clearRuntimeNodes();
    this.generation = this.assets.beginGeneration();
    const results = await Promise.allSettled(
      Object.values(document.nodes).map(async (node) => ({
        node,
        object: await createSceneObject(node, this.assets, this.generation),
      })),
    );
    const created = results.flatMap((result) =>
      result.status === 'fulfilled' ? [result.value] : [],
    );
    const stale =
      this.disposed ||
      version !== this.loadVersion ||
      results.some(
        (result) =>
          result.status === 'rejected' &&
          result.reason instanceof StaleAssetLoadError,
      );
    if (stale) {
      this.disposeCreated(created.map(({ object }) => object));
      throw new StaleAssetLoadError();
    }
    const unexpected = results.find((result) => result.status === 'rejected');
    if (unexpected?.status === 'rejected') {
      this.disposeCreated(created.map(({ object }) => object));
      throw unexpected.reason;
    }

    for (const { node, object } of created) this.objects.set(node.id, object);
    this.attachHierarchy(document);
    return this.buildReport();
  }

  async addNode(node: SceneNode): Promise<Object3D> {
    if (this.objects.has(node.id)) throw new Error(`节点已存在: ${node.id}`);
    const object = await createSceneObject(node, this.assets, this.generation);
    this.objects.set(node.id, object);
    const parent = node.parentId ? this.objects.get(node.parentId) : this.root;
    (parent ?? this.root).add(object);
    return object;
  }

  removeNodes(ids: Iterable<string>): void {
    const removing = new Set(ids);
    for (const [id, object] of this.objects) {
      let parent = object.parent;
      while (parent && parent !== this.root) {
        const parentId = this.getNodeId(parent);
        if (parentId && removing.has(parentId)) removing.add(id);
        parent = parent.parent;
      }
    }
    const objects = [...removing]
      .map((id) => ({ id, object: this.objects.get(id) }))
      .filter((item): item is { id: string; object: Object3D } =>
        Boolean(item.object),
      );
    for (const { object } of objects) object.removeFromParent();
    for (const { id, object } of objects) {
      if (!this.assets.release(object)) disposeObject3D(object);
      this.objects.delete(id);
    }
  }

  async updateNode(node: SceneNode): Promise<void> {
    const object = this.objects.get(node.id);
    if (!object) throw new Error(`节点不存在: ${node.id}`);
    if (this.requiresReplacement(object, node)) {
      await this.replaceNode(node);
      return;
    }
    applySceneNode(object, node);
    const geometry = node.components.find(
      (component) => component.kind === 'geometry',
    );
    if (
      geometry?.kind === 'geometry' &&
      object instanceof Mesh &&
      typeof object.userData.geometryPrimitive === 'string' &&
      object.userData.geometryPrimitive !== geometry.primitive
    ) {
      // 基础几何体由当前节点独占，替换时可立即释放；模型缓存的共享几何不走此分支。
      object.geometry.dispose();
      object.geometry = createPrimitiveGeometry(geometry.primitive);
      object.userData.geometryPrimitive = geometry.primitive;
    }
    const light = node.components.find(
      (component) => component.kind === 'light',
    );
    if (light?.kind === 'light' && object instanceof Light) {
      object.intensity = light.intensity;
      object.color.set(light.color);
      if ('castShadow' in object) object.castShadow = light.castShadow;
    }
  }

  private requiresReplacement(object: Object3D, node: SceneNode): boolean {
    const model = node.components.find(
      (component) => component.kind === 'model',
    );
    const geometry = node.components.find(
      (component) => component.kind === 'geometry',
    );
    const light = node.components.find(
      (component) => component.kind === 'light',
    );
    const nextPrimaryKind = model
      ? 'model'
      : geometry
        ? 'geometry'
        : light
          ? 'light'
          : (node.components[0]?.kind ?? 'group');
    if (object.userData.primaryComponentKind !== nextPrimaryKind) return true;
    if (model?.kind === 'model') {
      return object.userData.assetId !== model.assetId;
    }
    if (light?.kind === 'light') {
      return object.userData.lightType !== light.lightType;
    }
    return false;
  }

  /**
   * 模型资源或主组件类型变化时先在场景外完成新对象创建；只有创建成功且代次仍有效
   * 才替换旧对象，避免异步失败把当前可见节点删掉。
   */
  async replaceNode(node: SceneNode): Promise<Object3D> {
    const previous = this.objects.get(node.id);
    if (!previous) throw new Error(`节点不存在: ${node.id}`);
    const version = this.loadVersion;
    const generation = this.generation;
    const replacement = await createSceneObject(node, this.assets, generation);
    if (
      this.disposed ||
      version !== this.loadVersion ||
      generation !== this.generation ||
      this.objects.get(node.id) !== previous
    ) {
      if (!this.assets.release(replacement)) disposeObject3D(replacement);
      throw new StaleAssetLoadError();
    }

    const parent = previous.parent ?? this.root;
    const previousIndex = Math.max(parent.children.indexOf(previous), 0);
    parent.add(replacement);
    previous.removeFromParent();
    const appendedIndex = parent.children.indexOf(replacement);
    if (appendedIndex !== previousIndex) {
      parent.children.splice(appendedIndex, 1);
      parent.children.splice(previousIndex, 0, replacement);
    }
    this.objects.set(node.id, replacement);
    if (!this.assets.release(previous)) disposeObject3D(previous);
    return replacement;
  }

  getObject(nodeId: string): Object3D | undefined {
    return this.objects.get(nodeId);
  }

  getNodeId(object: Object3D): string | undefined {
    let current: Object3D | null = object;
    while (current && current !== this.root) {
      if (typeof current.userData.sceneNodeId === 'string') {
        return current.userData.sceneNodeId;
      }
      current = current.parent;
    }
    return undefined;
  }

  getStats(): SceneStats {
    let meshCount = 0;
    let vertexCount = 0;
    let faceCount = 0;
    this.root.traverse((object) => {
      if (!(object instanceof Mesh) || !this.isEffectivelyVisible(object)) {
        return;
      }
      meshCount += 1;
      const positions = object.geometry.getAttribute('position');
      const vertices = positions?.count ?? 0;
      vertexCount += vertices;
      faceCount += Math.floor((object.geometry.index?.count ?? vertices) / 3);
    });
    return {
      objectCount: this.objects.size,
      meshCount,
      vertexCount,
      faceCount,
    };
  }

  private isEffectivelyVisible(object: Object3D): boolean {
    let current: Object3D | null = object;
    while (current) {
      if (!current.visible) return false;
      if (current === this.root) return true;
      current = current.parent;
    }
    return false;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.loadVersion += 1;
    this.clearRuntimeNodes();
    this.assets.dispose();
    this.root.removeFromParent();
  }

  private attachHierarchy(document: SceneDocument): void {
    for (const object of this.objects.values()) object.removeFromParent();
    const attached = new Set<string>();
    const attach = (id: string, parent: Object3D): void => {
      if (attached.has(id)) return;
      const object = this.objects.get(id);
      const node = document.nodes[id];
      if (!object || !node) return;
      parent.add(object);
      attached.add(id);
      for (const childId of node.childIds) attach(childId, object);
    };
    for (const id of document.rootNodeIds) attach(id, this.root);
    // 协议校验之外仍做防御：孤立节点作为根显示，而不是静默丢失。
    for (const id of this.objects.keys()) attach(id, this.root);
  }

  private clearRuntimeNodes(): void {
    const objects = [...this.objects.values()];
    for (const object of objects) object.removeFromParent();
    for (const object of objects) {
      if (!this.assets.release(object)) disposeObject3D(object);
    }
    this.objects.clear();
    this.root.clear();
  }

  private disposeCreated(objects: Object3D[]): void {
    for (const object of objects) {
      if (!this.assets.release(object)) disposeObject3D(object);
    }
  }

  private buildReport(): LoadReport {
    const placeholderNodeIds: string[] = [];
    const errors: LoadReport['errors'] = [];
    for (const [nodeId, object] of this.objects) {
      if (typeof object.userData.loadError !== 'string') continue;
      placeholderNodeIds.push(nodeId);
      errors.push({ nodeId, message: object.userData.loadError });
    }
    return {
      loadedNodeIds: [...this.objects.keys()],
      placeholderNodeIds,
      errors,
    };
  }
}
