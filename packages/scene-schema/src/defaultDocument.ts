import type { SceneDocument } from './schema.js';

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
      background: '#3b3b3b',
      environmentAssetId: null,
      exposure: 1.2,
      gridVisible: true,
    },
    interactions: [],
    dataSources: [],
    socketTasks: [],
    assetReferences: [],
  };
}
