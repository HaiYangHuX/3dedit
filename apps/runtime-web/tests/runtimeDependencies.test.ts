import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import packageJson from '../package.json';
import App from '../src/App.vue';

describe('runtime-web', () => {
  it('不引入编辑器和 Element Plus', () => {
    expect('element-plus' in packageJson.dependencies).toBe(false);
    expect('@digital-twin/editor-core' in packageJson.dependencies).toBe(false);
    expect(packageJson.dependencies).toHaveProperty(
      '@digital-twin/runtime-core',
      'workspace:*',
    );
  });

  it('只渲染运行时画布', () => {
    const wrapper = mount(App, {
      global: {
        stubs: {
          RouterView: {
            template: '<div data-testid="runtime-canvas" />',
          },
        },
      },
    });

    expect(wrapper.get('[data-testid="runtime-canvas"]')).toBeTruthy();
    expect(wrapper.find('[data-testid="asset-panel"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="inspector-panel"]').exists()).toBe(
      false,
    );
  });
});
