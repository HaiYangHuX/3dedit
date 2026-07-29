import type { SceneSummary } from '@digital-twin/api-contracts';
import { flushPromises, mount } from '@vue/test-utils';
import { ElImage, ElUpload } from 'element-plus';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import SceneFormDialog from '../src/components/SceneFormDialog.vue';
import CoverImagePicker from '../src/components/CoverImagePicker.vue';
import { uploadCoverFile } from '../src/uploads/coverUpload';

vi.mock('../src/uploads/coverUpload', () => ({ uploadCoverFile: vi.fn() }));

const scene: SceneSummary = {
  id: 'scene-1',
  projectId: 'project-1',
  name: '主厂房',
  sortOrder: 0,
  revision: 0,
  contentHash: '',
  coverKey: 'https://assets.test/scene-cover.jpg',
  createdAt: '2026-07-16T06:00:00.000Z',
  updatedAt: '2026-07-16T06:00:00.000Z',
};

describe('SceneFormDialog', () => {
  beforeEach(() => vi.clearAllMocks());

  it('创建和编辑使用同一组字段，并展示已有场景封面', async () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    const create = mount(SceneFormDialog, {
      props: { modelValue: true, mode: 'create' },
      global: { plugins: [pinia], stubs: { Teleport: true } },
    });
    const edit = mount(SceneFormDialog, {
      props: { modelValue: true, mode: 'edit', scene },
      global: { plugins: [pinia], stubs: { Teleport: true } },
    });
    await flushPromises();

    for (const label of ['场景名称', '场景描述', '场景封面']) {
      expect(create.text()).toContain(label);
      expect(edit.text()).toContain(label);
    }
    expect(create.text()).not.toContain('项目描述');
    expect(edit.findAllComponents(CoverImagePicker)).toHaveLength(1);
    expect(edit.getComponent(ElImage).props('src')).toBe(scene.coverKey);
  });

  it('上传一张图片后把资源地址随创建场景表单提交', async () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    vi.mocked(uploadCoverFile).mockResolvedValue({
      objectKey: 'covers/scenes/scene-cover.png',
      url: 'https://assets.test/scene-cover.jpg',
    });
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:scene-cover');
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
    const wrapper = mount(SceneFormDialog, {
      props: { modelValue: true, mode: 'create' },
      global: { plugins: [pinia], stubs: { Teleport: true } },
    });
    await flushPromises();
    await wrapper
      .get('input[placeholder="例如：主厂房总览"]')
      .setValue('主厂房');
    const onChange = wrapper
      .findComponent(ElUpload)
      .props('onChange') as (file: { raw: File }) => void;
    onChange({ raw: new File(['cover'], 'cover.png', { type: 'image/png' }) });
    const submitButton = wrapper
      .findAll('button')
      .find((button) => button.text().includes('创建场景'));
    await submitButton?.trigger('click');
    await flushPromises();

    expect(uploadCoverFile).toHaveBeenCalledWith(
      expect.any(File),
      'scene-cover',
    );
    expect(wrapper.emitted('submit')?.[0]?.[0]).toEqual({
      name: '主厂房',
      description: '',
      coverKey: 'covers/scenes/scene-cover.png',
    });
  });
});
