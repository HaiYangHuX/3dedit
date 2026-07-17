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
      toneMapping: 'neutral',
      shadowMapType: 'pcf',
      exposure: 1.2,
      backgroundType: 'color',
      background: '#3b3b3b',
      backgroundAssetId: null,
      backgroundBlurriness: 0,
      backgroundIntensity: 5,
      environmentEnabled: true,
      environmentAssetId: null,
      fogType: 'exponential',
      fogColor: '#3b3b3b',
      fogNear: 1,
      fogFar: 200,
      fogDensity: 0.01,
      groundType: 'grid',
      gridVisible: true,
      weatherType: 'none',
      weatherCount: 2_000,
      weatherSpeed: 0.4,
      weatherOpacity: 0.6,
      weatherSize: 0.5,
      weatherArea: 100,
      weatherHeight: 50,
    },
    interactions: [],
    dataSources: [],
    socketTasks: [],
    assetReferences: [],
  };
}
