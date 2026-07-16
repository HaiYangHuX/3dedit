import {
  createDefaultSceneDocument,
  type SceneNode,
  type Transform,
} from '@digital-twin/scene-schema';
import { describe, expect, it, vi } from 'vitest';
import {
  AddNodeCommand,
  CommandHistory,
  RemoveNodesCommand,
  ReparentNodeCommand,
  TransformNodesCommand,
  UpdateNodeCommand,
  type EditorDocumentContext,
} from '../src/index.js';

const identityTransform: Transform = {
  position: [0, 0, 0],
  rotation: [0, 0, 0],
  scale: [1, 1, 1],
};

function node(id: string, parentId: string | null = null): SceneNode {
  return {
    id,
    parentId,
    childIds: [],
    name: id,
    enabled: true,
    locked: false,
    transform: structuredClone(identityTransform),
    components: [],
    businessData: {},
  };
}

function context(): EditorDocumentContext {
  return {
    document: createDefaultSceneDocument('project-1', 'scene-1', '场景一'),
    onChanged: vi.fn(),
  };
}

describe('文档命令', () => {
  it('删除子树时清理交互、Socket 和资源引用并可完整撤销', async () => {
    const editor = context();
    const parent = node('parent');
    const child = node('child', 'parent');
    parent.childIds.push(child.id);
    child.components.push({ kind: 'model', assetId: 'asset-1' });
    editor.document.nodes[parent.id] = parent;
    editor.document.nodes[child.id] = child;
    editor.document.rootNodeIds = [parent.id];
    editor.document.assetReferences = [
      { assetId: 'asset-1', nodeIds: [child.id] },
    ];
    editor.document.interactions = [
      {
        id: 'interaction-1',
        name: '点击',
        enabled: true,
        sourceNodeId: child.id,
        trigger: { type: 'click' },
        conditions: { logic: 'all', conditions: [] },
        execution: 'sequential',
        actions: [{ type: 'set-visibility', nodeId: child.id, visible: true }],
      },
    ];
    editor.document.dataSources = [
      {
        id: 'socket-1',
        name: '设备消息',
        type: 'websocket',
        url: 'ws://127.0.0.1:8080',
        enabled: true,
        heartbeatMs: 10_000,
        reconnectLimit: 3,
      },
    ];
    editor.document.socketTasks = [
      {
        id: 'task-1',
        dataSourceId: 'socket-1',
        taskCode: 'position',
        taskType: 'ModelPosition',
        targetNodeId: child.id,
        taskTime: 500,
        taskData: {},
      },
    ];
    const history = new CommandHistory(editor);

    await history.execute(new RemoveNodesCommand(['parent']));

    expect(editor.document.nodes.parent).toBeUndefined();
    expect(editor.document.nodes.child).toBeUndefined();
    expect(editor.document.rootNodeIds).toEqual([]);
    expect(editor.document.interactions).toEqual([]);
    expect(editor.document.socketTasks).toEqual([]);
    expect(editor.document.assetReferences).toEqual([]);

    await history.undo();
    expect(editor.document.nodes.child?.parentId).toBe('parent');
    expect(editor.document.interactions).toHaveLength(1);
    expect(editor.document.socketTasks).toHaveLength(1);
    expect(editor.document.assetReferences).toEqual([
      { assetId: 'asset-1', nodeIds: ['child'] },
    ]);
  });

  it('连续变换合并为一条历史并撤销到拖动前', async () => {
    const editor = context();
    const target = node('node-1');
    editor.document.nodes[target.id] = target;
    editor.document.rootNodeIds = [target.id];
    const history = new CommandHistory(editor);
    const first: Transform = {
      ...identityTransform,
      position: [1, 0, 0],
    };
    const second: Transform = {
      ...identityTransform,
      position: [2, 0, 0],
    };

    await history.execute(
      new TransformNodesCommand([
        { id: target.id, before: identityTransform, after: first },
      ]),
    );
    await history.execute(
      new TransformNodesCommand([
        { id: target.id, before: first, after: second },
      ]),
    );
    await history.undo();

    expect(editor.document.nodes[target.id]?.transform).toEqual(
      identityTransform,
    );
    expect(history.canUndo).toBe(false);
  });

  it('更新节点可撤销并自动重建模型资源引用', async () => {
    const editor = context();
    const target = node('node-1');
    editor.document.nodes[target.id] = target;
    editor.document.rootNodeIds = [target.id];
    const history = new CommandHistory(editor);

    await history.execute(
      new UpdateNodeCommand(target.id, {
        name: '水泵',
        components: [{ kind: 'model', assetId: 'asset-1' }],
      }),
    );
    expect(editor.document.nodes[target.id]?.name).toBe('水泵');
    expect(editor.document.assetReferences).toEqual([
      { assetId: 'asset-1', nodeIds: [target.id] },
    ]);

    await history.undo();
    expect(editor.document.nodes[target.id]?.name).toBe('node-1');
    expect(editor.document.assetReferences).toEqual([]);
  });

  it('拒绝把节点移动到自身后代并保持原层级不变', async () => {
    const editor = context();
    const parent = node('parent');
    const child = node('child', parent.id);
    parent.childIds = [child.id];
    editor.document.nodes = { parent, child };
    editor.document.rootNodeIds = [parent.id];
    const history = new CommandHistory(editor);

    await expect(
      history.execute(new ReparentNodeCommand(parent.id, child.id, 0)),
    ).rejects.toThrow('后代');
    expect(editor.document.rootNodeIds).toEqual([parent.id]);
    expect(editor.document.nodes.parent?.parentId).toBeNull();
  });

  it('新增节点触发一次变更通知', async () => {
    const editor = context();
    await new CommandHistory(editor).execute(new AddNodeCommand(node('new')));
    expect(editor.onChanged).toHaveBeenCalledTimes(1);
  });
});
