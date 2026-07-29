import type { ProjectSummary } from '@digital-twin/api-contracts';
import { flushPromises, mount } from '@vue/test-utils';
import { ElImage, ElUpload } from 'element-plus';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ProjectFormDialog from '../src/components/ProjectFormDialog.vue';
import CoverImagePicker from '../src/components/CoverImagePicker.vue';
import { uploadCoverFile } from '../src/uploads/coverUpload';

vi.mock('../src/uploads/coverUpload', () => ({ uploadCoverFile: vi.fn() }));

const project: ProjectSummary = {
  id: 'project-1',
  name: '智能工厂',
  description: '一期项目',
  code: 'FACTORY-1',
  coverKey: 'https://assets.test/project-cover.jpg',
  sceneCount: 1,
  createdAt: '2026-07-16T06:00:00.000Z',
  updatedAt: '2026-07-16T06:00:00.000Z',
};

describe('ProjectFormDialog', () => {
  beforeEach(() => vi.clearAllMocks());

  it('创建和编辑使用同一组基础字段与封面字段', async () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    const create = mount(ProjectFormDialog, {
      props: { modelValue: true, mode: 'create' },
      global: { plugins: [pinia], stubs: { Teleport: true } },
    });
    const edit = mount(ProjectFormDialog, {
      props: { modelValue: true, mode: 'edit', project },
      global: { plugins: [pinia], stubs: { Teleport: true } },
    });
    await flushPromises();

    for (const label of ['项目名称', '项目编码', '项目描述', '封面图片']) {
      expect(create.text()).toContain(label);
      expect(edit.text()).toContain(label);
    }
    expect(edit.findAllComponents(CoverImagePicker)).toHaveLength(1);
    expect(edit.getComponent(ElImage).props('src')).toBe(project.coverKey);
  });

  it('创建项目时上传封面并把最终 URL 一起提交', async () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    vi.mocked(uploadCoverFile).mockResolvedValue({
      objectKey: 'covers/projects/project-cover.png',
      url: 'https://assets.test/project-cover.jpg',
    });
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:project-cover');
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
    const wrapper = mount(ProjectFormDialog, {
      props: { modelValue: true, mode: 'create' },
      global: { plugins: [pinia], stubs: { Teleport: true } },
    });
    await flushPromises();
    await wrapper
      .get('input[placeholder="例如：智能工厂一期"]')
      .setValue('新工厂');
    const onChange = wrapper
      .findComponent(ElUpload)
      .props('onChange') as (file: { raw: File }) => void;
    onChange({ raw: new File(['cover'], 'cover.png', { type: 'image/png' }) });
    await wrapper
      .findAll('button')
      .find((button) => button.text().includes('创建'))
      ?.trigger('click');
    await flushPromises();

    expect(uploadCoverFile).toHaveBeenCalledWith(
      expect.any(File),
      'project-cover',
    );
    expect(wrapper.emitted('submit')?.[0]?.[0]).toEqual({
      name: '新工厂',
      description: '',
      code: '',
      coverKey: 'covers/projects/project-cover.png',
    });
  });
});
