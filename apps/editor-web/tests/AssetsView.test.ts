import type { Asset } from '@digital-twin/api-contracts';
import { mount } from '@vue/test-utils';
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
});
