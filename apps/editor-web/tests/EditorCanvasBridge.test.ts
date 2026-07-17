import {
  createDefaultSceneDocument,
  type SceneNode,
} from '@digital-twin/scene-schema';
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
    applyCamera: vi.fn(),
    applyCameraRoamingList: vi.fn(),
    startCameraRoamingDrawing: vi.fn().mockReturnValue(true),
    cancelCameraRoamingDrawing: vi.fn(),
    previewCameraRoaming: vi.fn().mockReturnValue(true),
    stopCameraRoaming: vi.fn(),
    setSelection: vi.fn(),
    selectModelPart: vi.fn().mockReturnValue(true),
    setTransformMode: vi.fn(),
    setTransformSpace: vi.fn(),
    handleShortcut: vi.fn().mockReturnValue(true),
    focusSelection: vi.fn().mockReturnValue(true),
    togglePointerLock: vi.fn().mockReturnValue(true),
    setMeasurementEnabled: vi.fn().mockReturnValue(true),
    setSelectWholeModel: vi.fn(),
    alignModelsToGround: vi.fn().mockReturnValue([]),
    setCameraView: vi.fn(),
    resetCamera: vi.fn(),
    captureScreenshot: vi.fn().mockResolvedValue(new Blob(['png'])),
    getDropPosition: vi.fn().mockReturnValue([1, 0, 2]),
    getStats: vi.fn().mockReturnValue({
      objectCount: 0,
      meshCount: 0,
      vertexCount: 0,
      faceCount: 0,
    }),
    getModelStructures: vi.fn().mockReturnValue({
      'node-1': [
        {
          objectId: 'object-1',
          targetObjectId: 'object-1',
          name: '水泵叶轮',
          objectType: 'Mesh',
        },
      ],
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
    expect(wrapper.emitted('model-structure-change')?.at(-1)).toEqual([
      {
        'node-1': [
          {
            objectId: 'object-1',
            targetObjectId: 'object-1',
            name: '水泵叶轮',
            objectType: 'Mesh',
          },
        ],
      },
    ]);

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
    mocks.listeners.get('camerachange')?.({
      type: 'camerachange',
      quaternion: [0, 0, 0, 1],
    });
    mocks.listeners.get('camerastatechange')?.({
      type: 'camerastatechange',
      camera: document.camera,
    });
    mocks.listeners.get('cameraroamingstatechange')?.({
      type: 'cameraroamingstatechange',
      mode: 'drawing',
      pointCount: 1,
      activePathId: null,
    });
    mocks.listeners.get('cameraroamingpathcreated')?.({
      type: 'cameraroamingpathcreated',
      pathPoints: [
        [0, 0.55, 0],
        [4, 0.55, 4],
      ],
    });
    mocks.listeners.get('renderstatschange')?.({
      type: 'renderstatschange',
      fps: 60,
      drawCalls: 3,
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
    expect(wrapper.emitted('camera-change')?.at(-1)).toEqual([
      { quaternion: [0, 0, 0, 1] },
    ]);
    expect(wrapper.emitted('camera-state-change')?.at(-1)).toEqual([
      document.camera,
    ]);
    expect(wrapper.emitted('camera-roaming-state-change')?.at(-1)).toEqual([
      { mode: 'drawing', pointCount: 1, activePathId: null },
    ]);
    expect(wrapper.emitted('camera-roaming-path-created')?.at(-1)).toEqual([
      [
        [0, 0.55, 0],
        [4, 0.55, 4],
      ],
    ]);
    expect(wrapper.emitted('render-stats-change')?.at(-1)).toEqual([
      { fps: 60, drawCalls: 3 },
    ]);
    expect(
      wrapper
        .get('[data-testid="editor-canvas"]')
        .attributes('data-scene-object-count'),
    ).toBe('1');

    const bridge = wrapper.vm as unknown as {
      applyNodeAdded(node: SceneNode): Promise<void>;
      applyNodeRemoved(ids: string[]): void;
      applyNodeUpdated(node: SceneNode): Promise<void>;
    };
    const changedNode: SceneNode = {
      id: 'node-1',
      parentId: null,
      childIds: [],
      name: '水泵',
      enabled: true,
      locked: false,
      transform: {
        position: [0, 0, 0],
        rotation: [0, 0, 0],
        scale: [1, 1, 1],
      },
      components: [{ kind: 'model', assetId: 'asset-1' }],
      businessData: {},
    };
    await bridge.applyNodeAdded(changedNode);
    bridge.applyNodeRemoved([changedNode.id]);
    await bridge.applyNodeUpdated(changedNode);
    expect(mocks.engine.getModelStructures).toHaveBeenCalledTimes(4);
    expect(wrapper.emitted('model-structure-change')).toHaveLength(4);

    await wrapper.get('[data-testid="editor-canvas"]').trigger('drop', {
      clientX: 200,
      clientY: 100,
      dataTransfer: {
        getData: vi.fn().mockReturnValue(
          JSON.stringify({
            kind: 'geometry',
            primitive: 'box',
          }),
        ),
      },
    });
    expect(mocks.engine.getDropPosition).toHaveBeenCalledWith(200, 100, 0.5);
    expect(wrapper.emitted('scene-drop')?.at(-1)).toEqual([
      {
        kind: 'geometry',
        primitive: 'box',
        position: [1, 0, 2],
      },
    ]);

    await wrapper.get('[data-testid="editor-canvas"]').trigger('drop', {
      clientX: 240,
      clientY: 120,
      dataTransfer: {
        getData: vi.fn().mockReturnValue(
          JSON.stringify({
            kind: 'asset',
            assetId: 'asset-1',
            name: '水泵',
            format: 'glb',
          }),
        ),
      },
    });
    expect(wrapper.emitted('scene-drop')?.at(-1)).toEqual([
      {
        kind: 'asset',
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
      applyCamera(camera: typeof document.camera): void;
      applyCameraRoamingList(paths: typeof document.cameraRoamingList): void;
      startCameraRoamingDrawing(): boolean;
      cancelCameraRoamingDrawing(): void;
      previewCameraRoaming(pathId: string): boolean;
      stopCameraRoaming(): void;
      selectModelPart(nodeId: string, objectId: string): boolean;
      setTransformMode(mode: 'translate' | 'rotate' | 'scale'): void;
      setTransformSpace(space: 'local' | 'world'): void;
      handleShortcut(code: string): boolean;
      focusSelection(): boolean;
      setCameraView(view: 'front'): void;
      resetCamera(): void;
      togglePointerLock(): boolean;
      setMeasurementEnabled(enabled: boolean): boolean;
      setSelectWholeModel(enabled: boolean): void;
      alignModelsToGround(): unknown[];
      captureScreenshot(): Promise<Blob>;
    };

    bridge.setSelection(['node-1'], 'node-1');
    bridge.applyCamera(document.camera);
    bridge.applyCameraRoamingList(document.cameraRoamingList);
    expect(bridge.startCameraRoamingDrawing()).toBe(true);
    bridge.cancelCameraRoamingDrawing();
    expect(bridge.previewCameraRoaming('path-1')).toBe(true);
    bridge.stopCameraRoaming();
    expect(bridge.selectModelPart('node-1', 'object-1')).toBe(true);
    bridge.setTransformMode('rotate');
    bridge.setTransformSpace('local');
    expect(bridge.handleShortcut('Escape')).toBe(true);
    bridge.setCameraView('front');
    bridge.resetCamera();
    expect(bridge.togglePointerLock()).toBe(true);
    expect(bridge.setMeasurementEnabled(true)).toBe(true);
    bridge.setSelectWholeModel(false);
    expect(bridge.alignModelsToGround()).toEqual([]);
    await bridge.captureScreenshot();
    expect(bridge.focusSelection()).toBe(true);

    expect(mocks.engine.setSelection).toHaveBeenCalledWith(
      ['node-1'],
      'node-1',
    );
    expect(mocks.engine.applyCamera).toHaveBeenCalledWith(document.camera);
    expect(mocks.engine.applyCameraRoamingList).toHaveBeenCalledWith(
      document.cameraRoamingList,
    );
    expect(mocks.engine.startCameraRoamingDrawing).toHaveBeenCalled();
    expect(mocks.engine.cancelCameraRoamingDrawing).toHaveBeenCalled();
    expect(mocks.engine.previewCameraRoaming).toHaveBeenCalledWith('path-1');
    expect(mocks.engine.stopCameraRoaming).toHaveBeenCalled();
    expect(mocks.engine.selectModelPart).toHaveBeenCalledWith(
      'node-1',
      'object-1',
    );
    expect(mocks.engine.setTransformMode).toHaveBeenCalledWith('rotate');
    expect(mocks.engine.setTransformSpace).toHaveBeenCalledWith('local');
    expect(mocks.engine.handleShortcut).toHaveBeenCalledWith('Escape');
    expect(mocks.engine.focusSelection).toHaveBeenCalled();
    expect(mocks.engine.setCameraView).toHaveBeenCalledWith('front');
    expect(mocks.engine.resetCamera).toHaveBeenCalled();
    expect(mocks.engine.togglePointerLock).toHaveBeenCalled();
    expect(mocks.engine.setMeasurementEnabled).toHaveBeenCalledWith(true);
    expect(mocks.engine.setSelectWholeModel).toHaveBeenCalledWith(false);
    expect(mocks.engine.alignModelsToGround).toHaveBeenCalled();
    expect(mocks.engine.captureScreenshot).toHaveBeenCalled();
    wrapper.unmount();
  });
});
