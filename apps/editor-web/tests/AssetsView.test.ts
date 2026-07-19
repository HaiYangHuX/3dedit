import type { Asset, AssetDetail } from '@digital-twin/api-contracts';
import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { describe, expect, it, vi } from 'vitest';
import { useAssetStore } from '../src/stores/asset';
import AssetsView from '../src/views/AssetsView.vue';

const asset: Asset = {
  id: 'asset-1',
  name: '离心泵',
  kind: 'model',
  format: 'glb',
  status: 'ready',
  category: '设备',
  tags: ['泵'],
  favorite: true,
  sourceHash: 'a'.repeat(64),
  metadata: { vertexCount: 1200, faceCount: 600 },
  error: null,
  retryCount: 0,
  thumbnailUrl: null,
  sourceSize: 2048,
  referenceCount: 1,
  createdAt: '2026-07-16T08:00:00.000Z',
  updatedAt: '2026-07-16T08:01:00.000Z',
};

describe('AssetsView', () => {
  it('渲染上传区、筛选工具和真实资源卡片', () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    const store = useAssetStore();
    store.assets = [asset];
    store.total = 1;
    vi.spyOn(store, 'loadAssets').mockResolvedValue();

    const wrapper = mount(AssetsView, {
      global: {
        plugins: [pinia],
        stubs: {
          RouterLink: { template: '<a><slot /></a>' },
          Teleport: true,
          AssetPreviewCanvas: { template: '<div />' },
          // Element Plus Select 的 option 注册依赖真实布局观察器，happy-dom 下使用结构桩即可。
          ElSelect: { template: '<select><slot /></select>' },
          ElOption: { template: '<option />' },
        },
      },
    });

    expect(wrapper.get('[data-testid="asset-dropzone"]').text()).toContain(
      '拖放',
    );
    expect(wrapper.text()).toContain('离心泵');
    expect(wrapper.text()).toContain('1,200 顶点');
    expect(wrapper.get('[aria-label="搜索资源"]')).toBeTruthy();
  });

  it('详情只读，编辑入口打开与添加相同的资源表单', async () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    const store = useAssetStore();
    store.assets = [asset];
    store.total = 1;
    vi.spyOn(store, 'loadAssets').mockResolvedValue();
    vi.spyOn(store, 'openAsset').mockImplementation(async () => {
      const detail: AssetDetail = { ...asset, files: [] };
      store.selectedAsset = detail;
      return detail;
    });

    const wrapper = mount(AssetsView, {
      global: {
        plugins: [pinia],
        stubs: {
          Teleport: true,
          AssetPreviewCanvas: { template: '<div />' },
          ElSelect: { template: '<select><slot /></select>' },
          ElOption: { template: '<option />' },
        },
      },
    });
    const detailButton = wrapper
      .findAll('button')
      .find((button) => button.text() === '详情');
    expect(detailButton).toBeDefined();
    await detailButton?.trigger('click');
    await flushPromises();
    expect(
      wrapper.find('.asset-detail-sidebar .asset-detail-summary').exists(),
    ).toBe(true);
    expect(
      wrapper.find('.asset-detail-main .asset-detail-heading').exists(),
    ).toBe(false);
    expect(wrapper.text()).not.toContain('文件操作');
    expect(wrapper.text()).not.toContain('编辑元数据');
    expect(wrapper.text()).not.toContain('替换模型文件');

    const editButton = wrapper
      .findAll('button')
      .find((button) => button.text() === '编辑');
    expect(editButton).toBeDefined();
    await editButton?.trigger('click');
    await flushPromises();
    expect(wrapper.text()).toContain('编辑模型与素材');
    expect(wrapper.text()).toContain('源文件（可选）');
    expect(wrapper.text()).toContain('自定义封面（可选）');
  });

  it('表格视图的操作按钮保持单行紧凑排列', async () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    const store = useAssetStore();
    store.assets = [asset];
    store.total = 1;
    vi.spyOn(store, 'loadAssets').mockResolvedValue();

    const wrapper = mount(AssetsView, {
      global: {
        plugins: [pinia],
        stubs: {
          Teleport: true,
          AssetPreviewCanvas: { template: '<div />' },
          ElSelect: { template: '<select><slot /></select>' },
          ElOption: { template: '<option />' },
        },
      },
    });
    await flushPromises();

    await wrapper.findAll('.view-switch button')[1]!.trigger('click');
    expect(wrapper.find('.asset-table-actions').exists()).toBe(true);
    expect(wrapper.findAll('.asset-table-actions .el-button')).toHaveLength(4);
  });
});
