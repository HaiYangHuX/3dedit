import {
  createDefaultSceneDocument,
  type SceneDocument,
  type SceneNode,
} from '@digital-twin/scene-schema';
import { describe, expect, it } from 'vitest';
import {
  hashSceneDocument,
  normalizeSceneDocument,
} from '../src/scenes/scene-document.js';

function createModelNode(id: string, assetId: string): SceneNode {
  return {
    id,
    parentId: null,
    childIds: [],
    name: id,
    enabled: true,
    locked: false,
    transform: {
      position: [0, 0, 0],
      rotation: [0, 0, 0],
      scale: [1, 1, 1],
    },
    components: [{ kind: 'model', assetId }],
    businessData: {},
  };
}

describe('场景文档服务端归一化', () => {
  it('覆盖身份并从节点和环境重算资源引用', () => {
    const document = createDefaultSceneDocument(
      'fake-project',
      'fake-scene',
      '伪造',
    );
    document.nodes = {
      'node-2': createModelNode('node-2', 'asset-a'),
      'node-1': createModelNode('node-1', 'asset-a'),
    };
    document.rootNodeIds = ['node-2', 'node-1'];
    document.settings.environmentAssetId = 'asset-env';
    document.assetReferences = [{ assetId: 'forged', nodeIds: [] }];

    const result = normalizeSceneDocument(
      document,
      { id: 'scene-1', projectId: 'project-1', name: '厂区' },
      4,
    );

    expect(result).toMatchObject({
      id: 'scene-1',
      projectId: 'project-1',
      name: '厂区',
      revision: 4,
    });
    expect(result.assetReferences).toEqual([
      { assetId: 'asset-a', nodeIds: ['node-1', 'node-2'] },
      { assetId: 'asset-env', nodeIds: [] },
    ]);
  });

  it('对键插入顺序不同的等价文档生成相同哈希', () => {
    const first = createDefaultSceneDocument('project-1', 'scene-1', '场景');
    const second = structuredClone(first);
    first.settings = {
      background: '#000000',
      environmentAssetId: null,
      exposure: 1,
      gridVisible: true,
    };
    second.settings = {
      gridVisible: true,
      exposure: 1,
      environmentAssetId: null,
      background: '#000000',
    } as SceneDocument['settings'];

    expect(hashSceneDocument(first)).toBe(hashSceneDocument(second));
  });
});
