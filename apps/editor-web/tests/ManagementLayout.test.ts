import { flushPromises, mount } from '@vue/test-utils';
import { createMemoryHistory, createRouter } from 'vue-router';
import { describe, expect, it } from 'vitest';
import ManagementLayout from '../src/layouts/ManagementLayout.vue';

function mountLayout() {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/assets', component: { template: '<div />' } }],
  });
  router.push('/assets');
  return {
    router,
    wrapper: mount(ManagementLayout, { global: { plugins: [router] } }),
  };
}

describe('ManagementLayout', () => {
  it('收起时只保留图标并切换可访问名称，侧栏不会撑开内容区', async () => {
    const { router, wrapper } = mountLayout();
    await router.isReady();
    await flushPromises();

    expect(wrapper.text()).toContain('数字孪生');
    expect(wrapper.text()).not.toContain(['Three', 'FlowX'].join(''));
    const button = wrapper.get('.management-collapse-button');
    expect(wrapper.text()).not.toContain('本地工作区');
    expect(wrapper.find('.management-topbar__actions').exists()).toBe(false);
    expect(button.attributes('aria-label')).toBe('收起导航');
    await button.trigger('click');
    await flushPromises();

    expect(button.attributes('aria-label')).toBe('展开导航');
    expect(wrapper.find('.management-shell').classes()).toContain(
      'management-shell--collapsed',
    );
    expect(button.text()).toBe('');
  });
});
