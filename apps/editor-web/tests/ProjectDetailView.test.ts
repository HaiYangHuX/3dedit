import type { ProjectDetail } from '@digital-twin/api-contracts';
import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { describe, expect, it, vi } from 'vitest';
import { useProjectStore } from '../src/stores/project';
import ProjectDetailView from '../src/views/ProjectDetailView.vue';

describe('ProjectDetailView', () => {
  it('显示场景列表并生成编辑器入口', async () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    const store = useProjectStore();
    store.currentProject = {
      id: 'project-1',
      name: '厂区',
      description: '',
      coverKey: null,
      sceneCount: 1,
      createdAt: '2026-07-16T06:00:00.000Z',
      updatedAt: '2026-07-16T06:00:00.000Z',
      publicationStatus: null,
      scenes: [
        {
          id: 'scene-1',
          projectId: 'project-1',
          name: '主厂房',
          sortOrder: 0,
          revision: 0,
          contentHash: '',
          coverKey: null,
          createdAt: '2026-07-16T06:00:00.000Z',
          updatedAt: '2026-07-16T06:00:00.000Z',
        },
      ],
    } satisfies ProjectDetail;
    vi.spyOn(store, 'openProject').mockResolvedValue(store.currentProject);

    const wrapper = mount(ProjectDetailView, {
      props: { projectId: 'project-1' },
      global: {
        plugins: [pinia],
        stubs: {
          RouterLink: {
            props: ['to'],
            template: '<a :data-to="to"><slot /></a>',
          },
          Teleport: true,
        },
      },
    });
    await Promise.resolve();

    expect(wrapper.text()).toContain('主厂房');
    expect(
      wrapper.get('[data-testid="open-scene-scene-1"]').attributes('data-to'),
    ).toBe('/editor/project-1/scene-1');
  });
});
