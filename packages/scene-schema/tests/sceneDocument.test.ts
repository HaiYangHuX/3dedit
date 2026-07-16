import { describe, expect, it } from 'vitest';
import { createDefaultSceneDocument, sceneDocumentSchema } from '../src/index';

describe('SceneDocument', () => {
  it('创建可被协议校验的空场景', () => {
    const document = createDefaultSceneDocument(
      'project-1',
      'scene-1',
      '场景一',
    );

    expect(sceneDocumentSchema.parse(document)).toEqual(document);
    expect(document.schemaVersion).toBe(1);
    expect(document.revision).toBe(0);
  });

  it('拒绝父节点不存在的场景树', () => {
    const document = createDefaultSceneDocument(
      'project-1',
      'scene-1',
      '场景一',
    );
    document.nodes.child = {
      id: 'child',
      parentId: 'missing',
      childIds: [],
      name: '错误节点',
      enabled: true,
      locked: false,
      transform: {
        position: [0, 0, 0],
        rotation: [0, 0, 0],
        scale: [1, 1, 1],
      },
      components: [],
      businessData: {},
    };

    expect(() => sceneDocumentSchema.parse(document)).toThrow('父节点不存在');
  });
});
