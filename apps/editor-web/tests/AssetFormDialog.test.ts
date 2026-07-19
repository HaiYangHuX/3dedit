import type { Asset, AssetDetail } from '@digital-twin/api-contracts';
import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { describe, expect, it, vi } from 'vitest';
import AssetFormDialog from '../src/components/AssetFormDialog.vue';
import { useAssetStore } from '../src/stores/asset';

const asset: Asset = {
  id: 'asset-1',
  name: '离心泵',
  code: 'PUMP-01',
  description: '车间循环水泵',
  kind: 'model',
  format: 'glb',
  status: 'ready',
  category: '设备',
  tags: [],
  favorite: false,
  version: '生产版',
  sourceHash: 'a'.repeat(64),
  metadata: { vertexCount: 1200 },
  error: null,
  retryCount: 0,
  thumbnailUrl: null,
  sourceSize: 2048,
  referenceCount: 0,
  createdAt: '2026-07-16T08:00:00.000Z',
  updatedAt: '2026-07-16T08:01:00.000Z',
};

function mountDialog(props: { modelValue: boolean; asset?: Asset | null }) {
  const pinia = createPinia();
  setActivePinia(pinia);
  return {
    pinia,
    store: useAssetStore(),
    wrapper: mount(AssetFormDialog, {
      props,
      global: { plugins: [pinia], stubs: { Teleport: true } },
    }),
  };
}

describe('AssetFormDialog', () => {
  it('添加和编辑使用同一组字段，编辑文件为可选替换', async () => {
    const create = mountDialog({ modelValue: true });
    const edit = mountDialog({ modelValue: true, asset });
    await flushPromises();

    const fieldLabels = [
      '资源名称',
      '资源编码',
      '分类',
      '版本',
      '资源描述',
      '源文件',
      '自定义封面（可选）',
    ];
    for (const label of fieldLabels) {
      expect(create.wrapper.text()).toContain(label);
      expect(edit.wrapper.text()).toContain(label);
    }
    expect(create.wrapper.text()).toContain('添加模型与素材');
    expect(edit.wrapper.text()).toContain('编辑模型与素材');
    expect(edit.wrapper.text()).toContain('未选择新文件，将保留当前源文件');
    expect(edit.wrapper.text()).toContain('未选择新封面，将保留当前封面');
  });

  it('编辑时不选择文件也能保存同一表单里的元数据', async () => {
    const { store, wrapper } = mountDialog({ modelValue: true, asset });
    const detail: AssetDetail = { ...asset, files: [] };
    const update = vi.spyOn(store, 'updateAsset').mockResolvedValue(detail);
    const upload = vi.spyOn(store, 'uploadFile');
    await flushPromises();

    const nameInput = wrapper.get(
      'input[placeholder="例如：DEVICE-4x1 装配区"]',
    );
    await nameInput.setValue('离心泵（更新）');
    const saveButton = wrapper
      .findAll('button')
      .find((button) => button.text().includes('保存修改'));
    expect(saveButton).toBeDefined();
    await saveButton?.trigger('click');
    await flushPromises();

    expect(update).toHaveBeenCalledWith(
      'asset-1',
      expect.objectContaining({
        name: '离心泵（更新）',
        code: 'PUMP-01',
        category: '设备',
        version: '生产版',
        description: '车间循环水泵',
      }),
    );
    expect(upload).not.toHaveBeenCalled();
  });
});
