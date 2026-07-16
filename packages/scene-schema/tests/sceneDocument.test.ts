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

  it('接受声明式条件树与强类型交互动作', () => {
    const document = createDefaultSceneDocument(
      'project-1',
      'scene-1',
      '交互场景',
    );
    const node = {
      id: 'device',
      parentId: null,
      childIds: [],
      name: '设备',
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

    const result = sceneDocumentSchema.safeParse({
      ...document,
      rootNodeIds: [node.id],
      nodes: { [node.id]: node },
      interactions: [
        {
          id: 'interaction-1',
          name: '单击显示设备',
          enabled: true,
          sourceNodeId: node.id,
          trigger: { type: 'click' },
          conditions: {
            logic: 'all',
            conditions: [
              {
                left: { source: 'variable', key: 'enabled' },
                operator: 'eq',
                right: { source: 'literal', value: true },
              },
            ],
          },
          execution: 'sequential',
          actions: [
            {
              type: 'set-visibility',
              nodeId: node.id,
              visible: true,
            },
          ],
        },
      ],
    });

    expect(result.success).toBe(true);
  });

  it('拒绝任意脚本动作和悬空运行时引用', () => {
    const document = createDefaultSceneDocument(
      'project-1',
      'scene-1',
      '非法交互场景',
    );
    const baseInteraction = {
      id: 'interaction-1',
      name: '非法动作',
      enabled: true,
      sourceNodeId: 'missing-node',
      trigger: { type: 'click' },
      conditions: { logic: 'all', conditions: [] },
      execution: 'sequential',
    };

    expect(
      sceneDocumentSchema.safeParse({
        ...document,
        interactions: [
          {
            ...baseInteraction,
            actions: [{ type: 'eval', code: 'globalThis.compromised = true' }],
          },
        ],
      }).success,
    ).toBe(false);
    expect(
      sceneDocumentSchema.safeParse({
        ...document,
        interactions: [
          {
            ...baseInteraction,
            actions: [
              {
                type: 'set-visibility',
                nodeId: 'missing-node',
                visible: true,
              },
            ],
          },
        ],
      }).success,
    ).toBe(false);
  });
});
