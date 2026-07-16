import { createTestingPinia } from '@pinia/testing';
import { mount } from '@vue/test-utils';
import { describe, expect, it, vi } from 'vitest';
import EditorWorkspace from '../src/views/EditorWorkspace.vue';

describe('EditorWorkspace', () => {
  it('呈现资源区、视口、场景区和状态栏', () => {
    const wrapper = mount(EditorWorkspace, {
      global: {
        plugins: [createTestingPinia({ createSpy: vi.fn })],
        stubs: {
          EditorCanvas: {
            template: '<div data-testid="editor-canvas" />',
          },
          RouterLink: { template: '<a><slot /></a>' },
        },
      },
    });

    expect(wrapper.get('[data-testid="top-toolbar"]').text()).toContain('保存');
    expect(wrapper.get('[data-testid="asset-panel"]').text()).toContain('模型');
    expect(wrapper.get('[data-testid="inspector-panel"]').text()).toContain(
      '场景内容',
    );
    expect(wrapper.get('[data-testid="status-bar"]').text()).toContain('FPS');
  });
});
