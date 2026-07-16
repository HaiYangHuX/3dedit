import type { ProjectSummary } from '@digital-twin/api-contracts';
import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { describe, expect, it, vi } from 'vitest';
import { useProjectStore } from '../src/stores/project';
import ProjectsView from '../src/views/ProjectsView.vue';

const project: ProjectSummary = {
  id: 'project-1',
  name: '化工厂数字孪生',
  description: '三维厂区',
  coverKey: null,
  sceneCount: 2,
  createdAt: '2026-07-16T06:00:00.000Z',
  updatedAt: '2026-07-16T06:00:00.000Z',
};

describe('ProjectsView', () => {
  it('渲染真实项目并提供创建入口', async () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    const store = useProjectStore();
    store.projects = [project];
    vi.spyOn(store, 'loadProjects').mockResolvedValue();

    const wrapper = mount(ProjectsView, {
      global: {
        plugins: [pinia],
        stubs: {
          RouterLink: { template: '<a><slot /></a>' },
          Teleport: true,
        },
      },
    });

    expect(wrapper.text()).toContain('化工厂数字孪生');
    expect(wrapper.text()).toContain('2 个场景');
    await wrapper.get('[data-testid="create-project"]').trigger('click');
    expect(wrapper.find('[data-testid="project-dialog"]').exists()).toBe(true);
  });
});
