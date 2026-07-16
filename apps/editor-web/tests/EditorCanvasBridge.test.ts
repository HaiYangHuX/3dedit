import { createDefaultSceneDocument } from '@digital-twin/scene-schema';
import { flushPromises, mount } from '@vue/test-utils';
import { describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const listeners = new Map<string, (event: Record<string, unknown>) => void>();
  const engine = {
    initialize: vi.fn().mockResolvedValue(undefined),
    loadDocument: vi.fn().mockResolvedValue({
      loadedNodeIds: [],
      placeholderNodeIds: [],
      errors: [],
    }),
    addEventListener: vi.fn(
      (type: string, listener: (event: Record<string, unknown>) => void) => {
        listeners.set(type, listener);
      },
    ),
    removeEventListener: vi.fn(),
    addNode: vi.fn().mockResolvedValue({}),
    removeNodes: vi.fn(),
    updateNode: vi.fn(),
    setSelection: vi.fn(),
    setTransformMode: vi.fn(),
    setTransformSpace: vi.fn(),
    focusSelection: vi.fn().mockReturnValue(true),
    getDropPosition: vi.fn().mockReturnValue([1, 0, 2]),
    getStats: vi.fn().mockReturnValue({
      objectCount: 0,
      meshCount: 0,
      vertexCount: 0,
      faceCount: 0,
    }),
    dispose: vi.fn(),
  };
  return { listeners, engine };
});

vi.mock('@digital-twin/three-engine', () => ({
  EditorEngine: vi.fn(function EditorEngine() {
    return mocks.engine;
  }),
}));

import EditorCanvas from '../src/components/EditorCanvas.vue';

describe('EditorCanvas bridge', () => {
  it('加载文档、转发引擎事件并在卸载时对称释放', async () => {
    const document = createDefaultSceneDocument(
      'project-1',
      'scene-1',
      '主场景',
    );
    const wrapper = mount(EditorCanvas, { props: { document } });
    await flushPromises();

    expect(mocks.engine.initialize).toHaveBeenCalledOnce();
    expect(mocks.engine.loadDocument).toHaveBeenCalledWith(
      document,
      expect.objectContaining({ resolve: expect.any(Function) }),
    );
    expect(
      wrapper
        .get('[data-testid="editor-canvas"]')
        .attributes('data-engine-ready'),
    ).toBe('true');

    mocks.listeners.get('selectionchange')?.({
      type: 'selectionchange',
      ids: ['node-1'],
      primaryId: 'node-1',
    });
    mocks.listeners.get('transformend')?.({
      type: 'transformend',
      nodeId: 'node-1',
      before: { position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
      after: { position: [1, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
    });
    mocks.listeners.get('statschange')?.({
      type: 'statschange',
      objectCount: 1,
      meshCount: 1,
      vertexCount: 24,
      faceCount: 12,
    });

    expect(wrapper.emitted('select')?.at(-1)).toEqual([
      { ids: ['node-1'], primaryId: 'node-1' },
    ]);
    expect(wrapper.emitted('transform-commit')?.at(-1)).toEqual([
      expect.objectContaining({ nodeId: 'node-1' }),
    ]);
    expect(wrapper.emitted('stats-change')?.at(-1)).toEqual([
      expect.objectContaining({ vertexCount: 24, faceCount: 12 }),
    ]);

    await wrapper.get('[data-testid="editor-canvas"]').trigger('drop', {
      clientX: 200,
      clientY: 100,
      dataTransfer: {
        getData: vi.fn().mockReturnValue(
          JSON.stringify({
            assetId: 'asset-1',
            name: '水泵',
            format: 'glb',
          }),
        ),
      },
    });
    expect(wrapper.emitted('asset-drop')?.at(-1)).toEqual([
      {
        assetId: 'asset-1',
        name: '水泵',
        format: 'glb',
        position: [1, 0, 2],
      },
    ]);

    wrapper.unmount();
    expect(mocks.engine.removeEventListener).toHaveBeenCalled();
    expect(mocks.engine.dispose).toHaveBeenCalledOnce();
  });

  it('通过 defineExpose 向工作区提供增量同步和工具方法', async () => {
    const document = createDefaultSceneDocument(
      'project-1',
      'scene-1',
      '主场景',
    );
    const wrapper = mount(EditorCanvas, { props: { document } });
    await flushPromises();
    const bridge = wrapper.vm as unknown as {
      setSelection(ids: string[], primaryId: string): void;
      setTransformMode(mode: 'translate' | 'rotate' | 'scale'): void;
      setTransformSpace(space: 'local' | 'world'): void;
      focusSelection(): boolean;
    };

    bridge.setSelection(['node-1'], 'node-1');
    bridge.setTransformMode('rotate');
    bridge.setTransformSpace('local');
    expect(bridge.focusSelection()).toBe(true);

    expect(mocks.engine.setSelection).toHaveBeenCalledWith(
      ['node-1'],
      'node-1',
    );
    expect(mocks.engine.setTransformMode).toHaveBeenCalledWith('rotate');
    expect(mocks.engine.setTransformSpace).toHaveBeenCalledWith('local');
    expect(mocks.engine.focusSelection).toHaveBeenCalled();
    wrapper.unmount();
  });
});
