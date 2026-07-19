import type { AssetDetail, ProjectSummary } from '@digital-twin/api-contracts';
import { flushPromises, mount } from '@vue/test-utils';
import { ElUpload } from 'element-plus';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { assetApi } from '../src/api/assets';
import ProjectFormDialog from '../src/components/ProjectFormDialog.vue';
import { useAssetStore } from '../src/stores/asset';

vi.mock('../src/api/assets', () => ({ assetApi: { get: vi.fn() } }));

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
    expect(edit.find('img').attributes('src')).toBe(project.coverKey);
  });

  it('创建项目时上传封面并把最终 URL 一起提交', async () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    const store = useAssetStore();
    const upload = vi.spyOn(store, 'uploadFile').mockResolvedValue({
      id: 'upload-1',
      fileName: 'cover.png',
      size: 5,
      progress: 100,
      status: 'ready',
      error: '',
      assetId: 'cover-asset',
      createdAt: '2026-07-16T06:00:00.000Z',
    });
    vi.mocked(assetApi.get).mockResolvedValue({
      id: 'cover-asset',
      name: '项目封面',
      kind: 'image',
      format: 'png',
      status: 'ready',
      category: '项目封面',
      tags: [],
      favorite: false,
      sourceHash: 'a'.repeat(64),
      metadata: {},
      error: null,
      retryCount: 0,
      thumbnailUrl: 'https://assets.test/project-cover.jpg',
      sourceSize: 5,
      referenceCount: 0,
      files: [],
      createdAt: '2026-07-16T06:00:00.000Z',
      updatedAt: '2026-07-16T06:00:00.000Z',
    } satisfies AssetDetail);
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

    expect(upload).toHaveBeenCalledWith(
      expect.any(File),
      expect.objectContaining({ category: '项目封面' }),
    );
    expect(wrapper.emitted('submit')?.[0]?.[0]).toEqual({
      name: '新工厂',
      description: '',
      code: '',
      coverKey: 'https://assets.test/project-cover.jpg',
    });
  });
});
