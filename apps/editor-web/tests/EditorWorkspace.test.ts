import { createTestingPinia } from '@pinia/testing';
import { flushPromises, mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ElMessageBox } from 'element-plus';
import { useAssetStore } from '../src/stores/asset';
import { useDocumentStore } from '../src/stores/document';

const commandMocks = vi.hoisted(() => {
  const operation = () => vi.fn().mockResolvedValue(undefined);
  return {
    addAssetNode: operation(),
    addGeometry: operation(),
    addLight: operation(),
    alignModelsToGround: operation(),
    captureScreenshot: vi.fn().mockResolvedValue(new Blob(['png'])),
    duplicateNode: operation(),
    focusSelection: vi.fn(),
    groupNodes: operation(),
    handleKeydown: vi.fn(),
    redo: operation(),
    removeNodes: operation(),
    reparentNode: operation(),
    resetCamera: vi.fn(),
    replaceCameraRoamingList: operation(),
    select: vi.fn(),
    selectFromCanvas: vi.fn(),
    startCameraRoamingDrawing: vi.fn(() => true),
    cancelCameraRoamingDrawing: vi.fn(),
    previewCameraRoaming: vi.fn(() => true),
    stopCameraRoaming: vi.fn(),
    syncCameraFromCanvas: operation(),
    setCameraView: vi.fn(),
    setMeasurementEnabled: vi.fn(() => false),
    setSelectWholeModel: vi.fn(),
    setTransformMode: vi.fn(),
    togglePointerLock: vi.fn(() => false),
    undo: operation(),
    updateNode: operation(),
    updateCamera: operation(),
    updateRuntimeConfig: operation(),
    updateSceneSettings: operation(),
  };
});

vi.mock('../src/editor/useEditorCommands', () => ({
  useEditorCommands: vi.fn(() => commandMocks),
}));

import EditorWorkspace from '../src/views/EditorWorkspace.vue';

describe('EditorWorkspace', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('呈现资源区、视口、场景区和状态栏', async () => {
    const wrapper = mount(EditorWorkspace, {
      global: {
        plugins: [createTestingPinia({ createSpy: vi.fn })],
        stubs: {
          EditorCanvas: {
            name: 'EditorCanvas',
            props: ['document'],
            template:
              '<div data-testid="editor-canvas" :data-document-id="document.id" />',
          },
          RouterLink: { template: '<a><slot /></a>' },
        },
      },
    });

    expect(wrapper.get('[data-testid="top-toolbar"]').text()).toContain('保存');
    expect(wrapper.get('[data-testid="undo-scene"]')).toBeTruthy();
    expect(wrapper.get('[data-testid="redo-scene"]')).toBeTruthy();
    expect(
      wrapper.get('[data-tool="translate"]').attributes('aria-label'),
    ).toContain('拖拽');
    expect(
      wrapper.get('[data-tool="rotate"]').attributes('aria-label'),
    ).toContain('旋转');
    expect(
      wrapper.get('[data-tool="scale"]').attributes('aria-label'),
    ).toContain('缩放');
    expect(
      wrapper.get('[data-tool="reset-camera"]').attributes('aria-label'),
    ).toContain('重置');
    expect(
      wrapper
        .get('[data-testid="editor-canvas"]')
        .attributes('data-document-id'),
    ).toBe('local-scene');
    expect(wrapper.get('[data-testid="asset-panel"]').text()).toContain('模型');
    await wrapper.get('[data-asset-category="geometry"]').trigger('click');
    expect(wrapper.get('[data-testid="add-geometry-box"]').text()).toContain(
      '立方体',
    );
    expect(
      wrapper.get('[data-testid="add-geometry-box"]').attributes('draggable'),
    ).toBe('true');
    const geometrySetData = vi.fn();
    await wrapper.get('[data-testid="add-geometry-box"]').trigger('dragstart', {
      dataTransfer: { setData: geometrySetData, effectAllowed: 'none' },
    });
    expect(geometrySetData).toHaveBeenCalledWith(
      'application/x-digital-twin-scene-palette',
      JSON.stringify({ kind: 'geometry', primitive: 'box' }),
    );
    await wrapper.get('[data-asset-category="light"]').trigger('click');
    expect(wrapper.get('[data-testid="add-light-point"]').text()).toContain(
      '点光源',
    );
    expect(
      wrapper.get('[data-testid="add-light-point"]').attributes('draggable'),
    ).toBe('true');
    const lightSetData = vi.fn();
    await wrapper.get('[data-testid="add-light-point"]').trigger('dragstart', {
      dataTransfer: { setData: lightSetData, effectAllowed: 'none' },
    });
    expect(lightSetData).toHaveBeenCalledWith(
      'application/x-digital-twin-scene-palette',
      JSON.stringify({ kind: 'light', lightType: 'point' }),
    );
    expect(wrapper.get('[data-testid="inspector-panel"]').text()).toContain(
      '场景内容',
    );
    expect(wrapper.get('[data-testid="viewport-stats"]').text()).toContain(
      'FPS',
    );
    expect(wrapper.get('[data-testid="preview-scene"]')).toBeTruthy();
    expect(wrapper.get('[data-testid="publish-scene"]')).toBeTruthy();
    expect(wrapper.get('[data-testid="scene-camera"]').text()).toContain(
      'Camera',
    );

    const modelStructures = {
      'runtime-model': [
        {
          objectId: 'runtime-mesh',
          targetObjectId: 'runtime-mesh',
          name: '清洗机机体',
          objectType: 'Mesh',
        },
      ],
    };
    wrapper
      .findComponent({ name: 'EditorCanvas' })
      .vm.$emit('model-structure-change', modelStructures);
    await flushPromises();
    expect(
      wrapper.findComponent({ name: 'SceneTree' }).props('modelStructures'),
    ).toEqual(modelStructures);

    const tabs = wrapper.findAll('.inspector-tabs button');
    await tabs.find((tab) => tab.text() === '交互事件')!.trigger('click');
    expect(wrapper.findComponent({ name: 'InteractionPanel' }).exists()).toBe(
      true,
    );
    await tabs.find((tab) => tab.text() === 'Socket 任务')!.trigger('click');
    expect(wrapper.findComponent({ name: 'SocketTaskPanel' }).exists()).toBe(
      true,
    );
  });

  it('按统一 scene-drop 类型分派现有命令并抬高几何体与灯光', async () => {
    const wrapper = mount(EditorWorkspace, {
      global: {
        plugins: [createTestingPinia({ createSpy: vi.fn })],
        stubs: {
          EditorCanvas: {
            name: 'EditorCanvas',
            props: ['document'],
            template: '<div data-testid="editor-canvas" />',
          },
          RouterLink: { template: '<a><slot /></a>' },
        },
      },
    });
    const canvas = wrapper.findComponent({ name: 'EditorCanvas' });

    canvas.vm.$emit('scene-drop', {
      kind: 'geometry',
      primitive: 'box',
      position: [4, 0, 6],
    });
    canvas.vm.$emit('scene-drop', {
      kind: 'light',
      lightType: 'point',
      position: [-2, 0.25, 3],
    });
    canvas.vm.$emit('scene-drop', {
      kind: 'asset',
      assetId: 'asset-1',
      name: '水泵',
      format: 'glb',
      position: [1, 0, 2],
    });
    await flushPromises();

    expect(commandMocks.addGeometry).toHaveBeenCalledWith('box', [4, 0.5, 6]);
    expect(commandMocks.addLight).toHaveBeenCalledWith('point', [-2, 0.5, 3]);
    expect(commandMocks.addAssetNode).toHaveBeenCalledWith(
      { id: 'asset-1', name: '水泵', format: 'glb' },
      [1, 0, 2],
    );
  });

  it('把二级项选择交给 Canvas，并在模型 UUID 失效后清理 current', async () => {
    const selectModelPart = vi.fn(() => true);
    const setSelection = vi.fn();
    const wrapper = mount(EditorWorkspace, {
      global: {
        plugins: [createTestingPinia({ createSpy: vi.fn })],
        stubs: {
          EditorCanvas: {
            name: 'EditorCanvas',
            methods: { selectModelPart, setSelection },
            template: '<div data-testid="editor-canvas" />',
          },
          RouterLink: { template: '<a><slot /></a>' },
        },
      },
    });
    const tree = wrapper.findComponent({ name: 'SceneTree' });
    tree.vm.$emit('select-model-part', {
      nodeId: 'model-1',
      objectId: 'material-1',
      targetObjectId: 'mesh-1',
    });
    await flushPromises();

    expect(selectModelPart).toHaveBeenCalledWith('model-1', 'mesh-1');
    expect(tree.props('selectedModelPart')).toEqual({
      nodeId: 'model-1',
      objectId: 'material-1',
    });

    wrapper
      .findComponent({ name: 'EditorCanvas' })
      .vm.$emit('model-structure-change', { 'model-1': [] });
    await flushPromises();
    expect(tree.props('selectedModelPart')).toBeNull();
    expect(setSelection).toHaveBeenCalled();
  });

  it('选择 Camera 后显示属性/漫游面板并闭环绘制、播放和删除', async () => {
    vi.spyOn(ElMessageBox, 'confirm').mockResolvedValue({
      action: 'confirm',
      value: '',
    } as never);
    const wrapper = mount(EditorWorkspace, {
      global: {
        plugins: [createTestingPinia({ createSpy: vi.fn })],
        stubs: {
          EditorCanvas: {
            name: 'EditorCanvas',
            methods: { setSelection: vi.fn() },
            template: '<div data-testid="editor-canvas" />',
          },
          RouterLink: { template: '<a><slot /></a>' },
        },
      },
    });

    wrapper.findComponent({ name: 'SceneTree' }).vm.$emit('select-camera');
    await flushPromises();
    const inspector = wrapper.findComponent({ name: 'CameraInspector' });
    expect(inspector.exists()).toBe(true);
    expect(commandMocks.select).toHaveBeenCalledWith({
      ids: [],
      primaryId: null,
    });

    inspector.vm.$emit('update', { fov: 60 });
    inspector.vm.$emit('start-drawing');
    inspector.vm.$emit('preview', 'path-1');
    inspector.vm.$emit('stop');
    await flushPromises();
    expect(commandMocks.updateCamera).toHaveBeenCalledWith({ fov: 60 });
    expect(commandMocks.startCameraRoamingDrawing).toHaveBeenCalled();
    expect(commandMocks.previewCameraRoaming).toHaveBeenCalledWith('path-1');
    expect(commandMocks.stopCameraRoaming).toHaveBeenCalled();

    wrapper
      .findComponent({ name: 'EditorCanvas' })
      .vm.$emit('camera-roaming-path-created', [
        [0, 0.55, 0],
        [4, 0.55, 4],
      ]);
    await flushPromises();
    expect(commandMocks.replaceCameraRoamingList).toHaveBeenCalledWith([
      expect.objectContaining({
        name: '漫游路径 1',
        pathPoints: [
          [0, 0.55, 0],
          [4, 0.55, 4],
        ],
      }),
    ]);

    inspector.vm.$emit('remove', 'path-1');
    await flushPromises();
    expect(ElMessageBox.confirm).toHaveBeenCalled();
  });

  it('将源站视口工具转发到对应编辑命令', async () => {
    const wrapper = mount(EditorWorkspace, {
      global: {
        plugins: [createTestingPinia({ createSpy: vi.fn })],
        stubs: {
          EditorCanvas: { template: '<div data-testid="editor-canvas" />' },
          RouterLink: { template: '<a><slot /></a>' },
        },
      },
    });
    const toolbar = wrapper.findComponent({ name: 'ViewportToolbar' });

    toolbar.vm.$emit('align-ground');
    toolbar.vm.$emit('pointer-lock', true);
    toolbar.vm.$emit('measure', true);
    toolbar.vm.$emit('choose-all', false);
    await flushPromises();

    expect(commandMocks.alignModelsToGround).toHaveBeenCalledOnce();
    expect(commandMocks.togglePointerLock).toHaveBeenCalledOnce();
    expect(commandMocks.setMeasurementEnabled).toHaveBeenCalledWith(true);
    expect(commandMocks.setSelectWholeModel).toHaveBeenCalledWith(false);
  });

  it('稳定文档对象原地更新后刷新项目配置控件', async () => {
    const pinia = createTestingPinia({ createSpy: vi.fn });
    const wrapper = mount(EditorWorkspace, {
      global: {
        plugins: [pinia],
        stubs: {
          EditorCanvas: { template: '<div data-testid="editor-canvas" />' },
          RouterLink: { template: '<a><slot /></a>' },
        },
      },
    });
    const store = useDocumentStore(pinia);

    await wrapper
      .findAll('.inspector-tabs button')
      .find((tab) => tab.text() === '项目配置')!
      .trigger('click');
    expect(wrapper.get('[data-testid="ground-type"]').text()).toContain('网格');

    // 命令历史必须保留文档对象身份，因此只递增变更代次通知 Vue 刷新原地修改。
    store.document.settings.groundType = 'floor';
    store.document.settings.gridVisible = false;
    store.documentChangeVersion += 1;
    await wrapper.vm.$nextTick();

    expect(wrapper.get('[data-testid="ground-type"]').text()).toContain('地板');
  });

  it('背景与环境文件经素材库处理完成后才写入场景', async () => {
    const pinia = createTestingPinia({ createSpy: vi.fn });
    const assetStore = useAssetStore(pinia);
    vi.mocked(assetStore.uploadFile).mockResolvedValue({
      id: 'upload-1',
      fileName: 'factory.hdr',
      size: 3,
      progress: 100,
      status: 'ready',
      error: '',
      assetId: 'environment-1',
      createdAt: '2026-07-17T00:00:00.000Z',
    });
    const wrapper = mount(EditorWorkspace, {
      global: {
        plugins: [pinia],
        stubs: {
          EditorCanvas: { template: '<div data-testid="editor-canvas" />' },
          RouterLink: { template: '<a><slot /></a>' },
        },
      },
    });
    const settingsTab = wrapper
      .findAll('.inspector-tabs button')
      .find((tab) => tab.text() === '项目配置');
    await settingsTab!.trigger('click');
    wrapper.findComponent({ name: 'SceneSettingsInspector' }).vm.$emit(
      'upload-environment',
      new File(['hdr'], 'factory.hdr', {
        type: 'application/octet-stream',
      }),
    );
    await flushPromises();

    expect(assetStore.uploadFile).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'factory.hdr' }),
      expect.objectContaining({ category: '场景环境' }),
    );
    expect(commandMocks.updateSceneSettings).toHaveBeenCalledWith({
      environmentAssetId: 'environment-1',
      environmentEnabled: true,
    });
  });
});
