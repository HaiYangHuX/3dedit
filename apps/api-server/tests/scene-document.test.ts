import {
  createDefaultMaterialComponent,
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
    const material = createDefaultMaterialComponent();
    material.textures.baseColor = {
      assetId: 'asset-texture',
      offset: [0, 0],
      repeat: [1, 1],
      rotation: 0,
      wrapS: 'repeat',
      wrapT: 'repeat',
    };
    document.nodes['node-1']!.components.push(material);
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
      { assetId: 'asset-texture', nodeIds: ['node-1'] },
    ]);
  });

  it('对键插入顺序不同的等价文档生成相同哈希', () => {
    const first = createDefaultSceneDocument('project-1', 'scene-1', '场景');
    const second = structuredClone(first);
    first.settings = {
      ...first.settings,
      background: '#000000',
      exposure: 1,
    };
    // 反转完整字段的插入顺序，避免用不完整旧协议伪造类型。
    second.settings = Object.fromEntries(
      Object.entries(first.settings).reverse(),
    ) as SceneDocument['settings'];

    expect(hashSceneDocument(first)).toBe(hashSceneDocument(second));
  });
});
