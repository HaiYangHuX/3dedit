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

/** SceneDocumentSystem 只依赖实例能力，单元测试无需创建真实网络 Loader。 */
export interface AssetInstanceProvider {
  beginGeneration(): number;
  instantiate(assetId: string, generation: number): Promise<Object3D>;
  release(root: Object3D): boolean;
  dispose(): void;
}
