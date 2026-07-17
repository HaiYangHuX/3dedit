import type { Object3D } from 'three';

export interface LoadReport {
  loadedNodeIds: string[];
  placeholderNodeIds: string[];
  errors: { nodeId: string; message: string }[];
}

export interface SceneStats {
  objectCount: number;
  meshCount: number;
  vertexCount: number;
  faceCount: number;
}

export interface RenderStats {
  fps: number;
  drawCalls: number;
}

/** 模型实例内部的只读 Three.js 对象投影，不参与场景文档持久化。 */
export interface ModelStructureNode {
  objectId: string;
  name: string;
  objectType: string;
  children: ModelStructureNode[];
}

/** key 为稳定 SceneNode ID，值为该模型根下的 Object3D 子树。 */
export type ModelStructureMap = Record<string, ModelStructureNode[]>;

/** SceneDocumentSystem 只依赖实例能力，单元测试无需创建真实网络 Loader。 */
export interface AssetInstanceProvider {
  beginGeneration(): number;
  instantiate(assetId: string, generation: number): Promise<Object3D>;
  release(root: Object3D): boolean;
  dispose(): void;
}
