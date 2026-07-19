import type { ProjectDetail } from '@digital-twin/api-contracts';
import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { describe, expect, it, vi } from 'vitest';
import { useProjectStore } from '../src/stores/project';
import SceneFormDialog from '../src/components/SceneFormDialog.vue';
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
          description: '主厂房设备总览',
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
    expect(wrapper.text()).toContain('主厂房设备总览');
    expect(wrapper.find('.project-detail-stats').exists()).toBe(false);
    expect(wrapper.find('.project-info-section').exists()).toBe(false);
    expect(wrapper.find('.project-detail-hero__crumb').exists()).toBe(false);
    expect(wrapper.find('.project-detail-page .section-heading').exists()).toBe(
      false,
    );
    expect(wrapper.find('.scene-card__initial').text()).toBe('主');
    expect(wrapper.find('button[title="场景设置"]').exists()).toBe(false);
    expect(wrapper.find('button[title="编辑场景"]').exists()).toBe(true);
    expect(wrapper.findAllComponents(SceneFormDialog)).toHaveLength(1);
    expect(wrapper.text()).not.toContain('运营信息');
    expect(wrapper.text()).not.toContain('负责人');
    expect(wrapper.text()).not.toContain('项目管理');
    expect(wrapper.text()).not.toContain('项目工作台');
    expect(wrapper.text()).not.toContain('E2E');
    // 场景允许全部删除，最后一张卡片仍应提供删除入口。
    expect(
      wrapper
        .findAll('button')
        .some((button) => button.text().includes('删除')),
    ).toBe(true);
    expect(
      wrapper.get('[data-testid="open-scene-scene-1"]').attributes('data-to'),
    ).toBe('/editor/project-1/scene-1');
  });
});
