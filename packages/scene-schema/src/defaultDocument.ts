import type { SceneDocument } from './schema';

/** 创建不含业务节点的可保存场景，供新建项目和测试复用。 */
export function createDefaultSceneDocument(
  projectId: string,
  sceneId: string,
  name: string,
): SceneDocument {
  return {
    schemaVersion: 1,
    id: sceneId,
    projectId,
    name,
    revision: 0,
    rootNodeIds: [],
    nodes: {},
    settings: {
      background: '#111827',
      environmentAssetId: null,
      exposure: 1,
      gridVisible: true,
    },
    interactions: [],
    dataSources: [],
    socketTasks: [],
    assetReferences: [],
  };
}
