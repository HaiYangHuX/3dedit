import { createTestingPinia } from '@pinia/testing';
import { mount } from '@vue/test-utils';
import { describe, expect, it, vi } from 'vitest';
import EditorWorkspace from '../src/views/EditorWorkspace.vue';

describe('EditorWorkspace', () => {
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
      wrapper
        .get('[data-testid="editor-canvas"]')
        .attributes('data-document-id'),
    ).toBe('local-scene');
    expect(wrapper.get('[data-testid="asset-panel"]').text()).toContain('模型');
    await wrapper.get('[data-asset-category="geometry"]').trigger('click');
    expect(wrapper.get('[data-testid="add-geometry-box"]').text()).toContain(
      '立方体',
    );
    await wrapper.get('[data-asset-category="light"]').trigger('click');
    expect(wrapper.get('[data-testid="add-light-point"]').text()).toContain(
      '点光源',
    );
    expect(wrapper.get('[data-testid="inspector-panel"]').text()).toContain(
      '场景内容',
    );
    expect(wrapper.get('[data-testid="status-bar"]').text()).toContain('FPS');
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
});
