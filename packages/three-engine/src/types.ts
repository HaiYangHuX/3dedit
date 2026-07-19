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

/** 模型实例下经过源站规则筛选的二级展示项，不参与场景文档持久化。 */
export interface ModelPartItem {
  /** 树行唯一键：单材质为 Mesh UUID，多材质为 Material UUID。 */
  objectId: string;
  /** 黄色包围盒实际绑定的 Mesh UUID。 */
  targetObjectId: string;
  /** 从模型根开始、由子节点索引组成的稳定路径，例如 0/2/1；根 Mesh 使用 $root。 */
  partPath?: string;
  name: string;
  objectType: string;
}

/** key 为稳定 SceneNode ID，值始终是直接挂在模型根下的平铺二级项。 */
export type ModelStructureMap = Record<string, ModelPartItem[]>;

/** SceneDocumentSystem 只依赖实例能力，单元测试无需创建真实网络 Loader。 */
export interface AssetInstanceProvider {
  /**
   * 开启新的异步加载代次；重载文档时保留现有实例，待新场景完整就绪后再释放。
   * 这样撤销/重做不会因为先清空旧根节点而产生黑屏闪烁。
   */
  beginGeneration(options?: { preserveExisting?: boolean }): number;
  instantiate(assetId: string, generation: number): Promise<Object3D>;
  release(root: Object3D): boolean;
  dispose(): void;
}
