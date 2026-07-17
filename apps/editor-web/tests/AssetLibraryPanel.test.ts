import type { Asset } from '@digital-twin/api-contracts';
import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { describe, expect, it, vi } from 'vitest';
import AssetLibraryPanel from '../src/components/AssetLibraryPanel.vue';
import { useAssetStore } from '../src/stores/asset';

const model: Asset = {
  id: 'asset-1',
  name: '水泵',
  kind: 'model',
  format: 'glb',
  status: 'ready',
  category: '设备',
  tags: [],
  favorite: false,
  sourceHash: 'a'.repeat(64),
  metadata: {},
  error: null,
  retryCount: 0,
  thumbnailUrl: null,
  sourceSize: 1024,
  referenceCount: 0,
  createdAt: '2026-07-16T08:00:00.000Z',
  updatedAt: '2026-07-16T08:00:00.000Z',
};

describe('AssetLibraryPanel', () => {
  it('为模型卡写入编辑器拖放 MIME 数据', async () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    const store = useAssetStore();
    store.assets = [model];
    vi.spyOn(store, 'loadAssets').mockResolvedValue();
    const setData = vi.fn();
    const wrapper = mount(AssetLibraryPanel, {
      global: {
        plugins: [pinia],
        stubs: { RouterLink: { template: '<a><slot /></a>' } },
      },
    });

    await wrapper.get('[data-asset-id="asset-1"]').trigger('dragstart', {
      dataTransfer: { setData, effectAllowed: '' },
    });

    expect(setData).toHaveBeenCalledWith(
      'application/x-digital-twin-scene-palette',
      JSON.stringify({
        kind: 'asset',
        assetId: 'asset-1',
        name: '水泵',
        format: 'glb',
      }),
    );
  });

  it('筛选区只保留主题化搜索框，不再显示管理入口', () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    const store = useAssetStore();
    store.assets = [model];
    vi.spyOn(store, 'loadAssets').mockResolvedValue();
    const wrapper = mount(AssetLibraryPanel, {
      global: { plugins: [pinia] },
    });

    expect(wrapper.find('.editor-model-search').exists()).toBe(true);
    expect(wrapper.find('.editor-asset-toolbar a').exists()).toBe(false);
    expect(wrapper.text()).not.toContain('管理');
  });
});
