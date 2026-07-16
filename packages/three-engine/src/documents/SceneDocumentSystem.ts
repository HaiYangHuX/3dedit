import type { SceneDocument, SceneNode } from '@digital-twin/scene-schema';
import { Group, Light, Mesh, type Object3D, type Scene } from 'three';
import { StaleAssetLoadError } from '../assets/AssetInstanceSystem.js';
import { disposeObject3D } from '../ResourceTracker.js';
import {
  applySceneNode,
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

  updateNode(node: SceneNode): void {
    const object = this.objects.get(node.id);
    if (!object) throw new Error(`节点不存在: ${node.id}`);
    applySceneNode(object, node);
    const light = node.components.find(
      (component) => component.kind === 'light',
    );
    if (light?.kind === 'light' && object instanceof Light) {
      object.intensity = light.intensity;
      object.color.set(light.color);
      if ('castShadow' in object) object.castShadow = light.castShadow;
    }
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
      if (!(object instanceof Mesh) || !object.visible) return;
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
