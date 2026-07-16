import {
  createDefaultSceneDocument,
  type SceneNode,
} from '@digital-twin/scene-schema';
import { describe, expect, it } from 'vitest';
import { AddNodeCommand, CommandHistory } from '../src';

describe('CommandHistory', () => {
  it('执行、撤销和重做新增节点', async () => {
    const context = {
      document: createDefaultSceneDocument('p1', 's1', '场景一'),
    };
    const history = new CommandHistory(context);
    const node: SceneNode = {
      id: 'box-1',
      parentId: null,
      childIds: [],
      name: '立方体',
      enabled: true,
      locked: false,
      transform: {
        position: [0, 0, 0],
        rotation: [0, 0, 0],
        scale: [1, 1, 1],
      },
      components: [{ kind: 'geometry', primitive: 'box' }],
      businessData: {},
    };

    await history.execute(new AddNodeCommand(node));
    expect(context.document.nodes['box-1']).toEqual(node);
    expect(history.isDirty).toBe(true);

    await history.undo();
    expect(context.document.nodes['box-1']).toBeUndefined();

    await history.redo();
    expect(context.document.nodes['box-1']).toEqual(node);
  });

  it('保存点之后无修改时不标记为脏', () => {
    const context = {
      document: createDefaultSceneDocument('p1', 's1', '场景一'),
    };
    const history = new CommandHistory(context);

    history.markSaved();

    expect(history.isDirty).toBe(false);
  });

  it('父节点不存在时不留下半完成节点', async () => {
    const context = {
      document: createDefaultSceneDocument('p1', 's1', '场景一'),
    };
    const history = new CommandHistory(context);
    const node: SceneNode = {
      id: 'orphan',
      parentId: 'missing',
      childIds: [],
      name: '孤立节点',
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

    await expect(history.execute(new AddNodeCommand(node))).rejects.toThrow(
      '父节点不存在',
    );
    expect(context.document.nodes.orphan).toBeUndefined();
    expect(history.isDirty).toBe(false);
  });
});
