import { createTestingPinia } from '@pinia/testing';
import { flushPromises, mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const commandMocks = vi.hoisted(() => {
  const operation = () => vi.fn().mockResolvedValue(undefined);
  return {
    addAssetNode: operation(),
    addGeometry: operation(),
    addLight: operation(),
    captureScreenshot: vi.fn().mockResolvedValue(new Blob(['png'])),
    duplicateNode: operation(),
    focusSelection: vi.fn(),
    groupNodes: operation(),
    handleKeydown: vi.fn(),
    redo: operation(),
    removeNodes: operation(),
    reparentNode: operation(),
    resetCamera: vi.fn(),
    select: vi.fn(),
    setCameraView: vi.fn(),
    setTransformMode: vi.fn(),
    undo: operation(),
    updateNode: operation(),
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
    expect(wrapper.get('[data-tool="translate"]').text()).toContain('移动');
    expect(wrapper.get('[data-tool="rotate"]').text()).toContain('旋转');
    expect(wrapper.get('[data-tool="scale"]').text()).toContain('缩放');
    expect(wrapper.get('[data-tool="focus"]').text()).toContain('聚焦');
    expect(
      wrapper.get('[data-tool="reset-camera"]').attributes('title'),
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
    expect(wrapper.get('[data-testid="viewport-gizmo"]')).toBeTruthy();
    expect(wrapper.get('[data-testid="preview-scene"]')).toBeTruthy();
    expect(wrapper.get('[data-testid="publish-scene"]')).toBeTruthy();

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
      { id: 'asset-1', name: '水泵' },
      [1, 0, 2],
    );
  });
});
