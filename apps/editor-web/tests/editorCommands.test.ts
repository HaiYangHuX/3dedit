import type { Asset } from '@digital-twin/api-contracts';
import { createPinia, setActivePinia } from 'pinia';
import { shallowRef } from 'vue';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { projectApi } from '../src/api/projects';
import { createAssetNode } from '../src/editor/createSceneNode';
import {
  useEditorCommands,
  type EditorCanvasBridge,
} from '../src/editor/useEditorCommands';
import { useDocumentStore } from '../src/stores/document';

vi.mock('../src/api/projects', () => ({
  projectApi: { getScene: vi.fn(), saveScene: vi.fn() },
}));

const asset: Asset = {
  id: 'asset-1',
  name: '离心泵',
  kind: 'model',
  format: 'glb',
  status: 'ready',
  category: '设备',
  tags: [],
  favorite: false,
  sourceHash: 'a'.repeat(64),
  metadata: {},
  error: null,
  retryCount: 0,
  thumbnailUrl: null,
  sourceSize: 1024,
  referenceCount: 0,
  createdAt: '2026-07-16T08:00:00.000Z',
  updatedAt: '2026-07-16T08:00:00.000Z',
};

describe('editor commands', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.clearAllMocks();
    vi.mocked(projectApi.getScene).mockResolvedValue({
      id: 'scene-1',
      projectId: 'project-1',
      name: '场景',
      sortOrder: 0,
      revision: 0,
      document: {
        schemaVersion: 1,
        id: 'scene-1',
        projectId: 'project-1',
        name: '场景',
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
      },
      contentHash: '',
      coverKey: null,
      createdAt: '2026-07-16T08:00:00.000Z',
      updatedAt: '2026-07-16T08:00:00.000Z',
    });
  });

  it('节点工厂为模型生成 UUID、默认变换和组件', () => {
    const node = createAssetNode(asset, [1, 0, 2]);

    expect(node.id).toMatch(/[0-9a-f-]{36}/i);
    expect(node).toMatchObject({
      name: '离心泵',
      parentId: null,
      transform: {
        position: [1, 0, 2],
        rotation: [0, 0, 0],
        scale: [1, 1, 1],
      },
      components: [{ kind: 'model', assetId: 'asset-1' }],
      businessData: {},
    });
  });

  it('模型拖放通过命令写入文档并增量加入引擎', async () => {
    const store = useDocumentStore();
    await store.loadScene('scene-1');
    const bridge: EditorCanvasBridge = {
      applyNodeAdded: vi.fn().mockResolvedValue(undefined),
      applyNodeRemoved: vi.fn(),
      applyNodeUpdated: vi.fn(),
      loadDocument: vi.fn().mockResolvedValue(undefined),
      setSelection: vi.fn(),
      setTransformMode: vi.fn(),
      focusSelection: vi.fn(),
    };
    const commands = useEditorCommands(shallowRef(bridge));

    const node = await commands.addAssetNode(asset, [2, 0, 3]);

    expect(store.document.nodes[node.id]).toEqual(node);
    expect(bridge.applyNodeAdded).toHaveBeenCalledWith(node);
    expect(bridge.setSelection).toHaveBeenCalledWith([node.id], node.id);
  });

  it('处理撤销、删除和 W/E/R/F，但输入框聚焦时不拦截', async () => {
    const store = useDocumentStore();
    await store.loadScene('scene-1');
    const bridge: EditorCanvasBridge = {
      applyNodeAdded: vi.fn().mockResolvedValue(undefined),
      applyNodeRemoved: vi.fn(),
      applyNodeUpdated: vi.fn(),
      loadDocument: vi.fn().mockResolvedValue(undefined),
      setSelection: vi.fn(),
      setTransformMode: vi.fn(),
      focusSelection: vi.fn().mockReturnValue(true),
    };
    const commands = useEditorCommands(shallowRef(bridge));
    const first = await commands.addAssetNode(asset, [0, 0, 0]);

    const input = document.createElement('input');
    input.addEventListener('keydown', commands.handleKeydown);
    input.dispatchEvent(
      new KeyboardEvent('keydown', {
        code: 'Delete',
        bubbles: true,
        cancelable: true,
      }),
    );
    expect(store.document.nodes[first.id]).toBeDefined();

    commands.handleKeydown(
      new KeyboardEvent('keydown', {
        code: 'Delete',
        cancelable: true,
      }),
    );
    await vi.waitFor(() =>
      expect(bridge.applyNodeRemoved).toHaveBeenCalledWith([first.id]),
    );
    expect(store.document.nodes[first.id]).toBeUndefined();

    commands.handleKeydown(
      new KeyboardEvent('keydown', {
        code: 'KeyZ',
        ctrlKey: true,
        cancelable: true,
      }),
    );
    await vi.waitFor(() => expect(bridge.loadDocument).toHaveBeenCalled());
    expect(store.document.nodes[first.id]).toBeDefined();

    for (const code of ['KeyW', 'KeyE', 'KeyR', 'KeyF']) {
      commands.handleKeydown(new KeyboardEvent('keydown', { code }));
    }
    expect(bridge.setTransformMode).toHaveBeenNthCalledWith(1, 'translate');
    expect(bridge.setTransformMode).toHaveBeenNthCalledWith(2, 'rotate');
    expect(bridge.setTransformMode).toHaveBeenNthCalledWith(3, 'scale');
    expect(bridge.focusSelection).toHaveBeenCalled();
  });

  it('快捷键异步操作失败时进入统一错误回调', async () => {
    const store = useDocumentStore();
    await store.loadScene('scene-1');
    const failure = new Error('视口重载失败');
    const onError = vi.fn();
    const bridge: EditorCanvasBridge = {
      applyNodeAdded: vi.fn().mockResolvedValue(undefined),
      applyNodeRemoved: vi.fn(),
      applyNodeUpdated: vi.fn(),
      loadDocument: vi.fn().mockRejectedValue(failure),
      setSelection: vi.fn(),
      setTransformMode: vi.fn(),
      focusSelection: vi.fn(),
    };
    const commands = useEditorCommands(shallowRef(bridge), { onError });
    await commands.addAssetNode(asset, [0, 0, 0]);

    commands.handleKeydown(
      new KeyboardEvent('keydown', {
        code: 'KeyZ',
        ctrlKey: true,
        cancelable: true,
      }),
    );

    await vi.waitFor(() => expect(onError).toHaveBeenCalledWith(failure));
  });

  it('可复制节点并将同层选中节点收入新建组', async () => {
    const store = useDocumentStore();
    await store.loadScene('scene-1');
    const bridge: EditorCanvasBridge = {
      applyNodeAdded: vi.fn().mockResolvedValue(undefined),
      applyNodeRemoved: vi.fn(),
      applyNodeUpdated: vi.fn(),
      loadDocument: vi.fn().mockResolvedValue(undefined),
      setSelection: vi.fn(),
      setTransformMode: vi.fn(),
      focusSelection: vi.fn(),
    };
    const commands = useEditorCommands(shallowRef(bridge));
    const first = await commands.addAssetNode(asset, [0, 0, 0]);
    const second = await commands.addAssetNode(
      { id: 'asset-2', name: '罐体' },
      [2, 0, 0],
    );

    const copy = await commands.duplicateNode(first.id);
    const group = await commands.groupNodes([first.id, second.id]);

    expect(copy.id).not.toBe(first.id);
    expect(copy.name).toContain('副本');
    expect(copy.components).toEqual(first.components);
    expect(group.childIds).toEqual([first.id, second.id]);
    expect(store.document.nodes[first.id]?.parentId).toBe(group.id);
    expect(store.document.nodes[second.id]?.parentId).toBe(group.id);
    expect(bridge.loadDocument).toHaveBeenCalled();
  });
});
