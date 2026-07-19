import type { AssetDetail, SceneSummary } from '@digital-twin/api-contracts';
import { flushPromises, mount } from '@vue/test-utils';
import { ElUpload } from 'element-plus';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { assetApi } from '../src/api/assets';
import SceneFormDialog from '../src/components/SceneFormDialog.vue';
import { useAssetStore } from '../src/stores/asset';

vi.mock('../src/api/assets', () => ({ assetApi: { get: vi.fn() } }));

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
    expect(edit.find('img').attributes('src')).toBe(scene.coverKey);
  });

  it('上传一张图片后把资源地址随创建场景表单提交', async () => {
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
      name: '场景封面',
      kind: 'image',
      format: 'png',
      status: 'ready',
      category: '场景封面',
      tags: [],
      favorite: false,
      sourceHash: 'a'.repeat(64),
      metadata: {},
      error: null,
      retryCount: 0,
      thumbnailUrl: 'https://assets.test/scene-cover.jpg',
      sourceSize: 5,
      referenceCount: 0,
      files: [],
      createdAt: '2026-07-16T06:00:00.000Z',
      updatedAt: '2026-07-16T06:00:00.000Z',
    } satisfies AssetDetail);
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

    expect(upload).toHaveBeenCalledWith(
      expect.any(File),
      expect.objectContaining({ category: '场景封面' }),
    );
    expect(wrapper.emitted('submit')?.[0]?.[0]).toEqual({
      name: '主厂房',
      description: '',
      coverKey: 'https://assets.test/scene-cover.jpg',
    });
  });
});
