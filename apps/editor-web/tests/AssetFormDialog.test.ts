import type { Asset, AssetDetail } from '@digital-twin/api-contracts';
import { flushPromises, mount } from '@vue/test-utils';
import { ElUpload, type UploadFile } from 'element-plus';
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

function selectUploadFile(
  wrapper: ReturnType<typeof mountDialog>['wrapper'],
  index: number,
  file: File,
): void {
  const upload = wrapper.findAllComponents(ElUpload)[index];
  if (!upload) throw new Error(`未找到第 ${index + 1} 个上传控件`);
  const onChange = upload.props('onChange') as (file: UploadFile) => void;
  onChange({ raw: file } as UploadFile);
}

function completedTask(assetId: string, file: File) {
  return {
    id: `task-${file.name}`,
    fileName: file.name,
    size: file.size,
    progress: 100,
    status: 'ready' as const,
    error: '',
    assetId,
    createdAt: '2026-07-16T08:00:00.000Z',
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

  it('编辑模型上传封面时绑定当前模型且不创建独立封面资源', async () => {
    const { store, wrapper } = mountDialog({ modelValue: true, asset });
    const detail: AssetDetail = { ...asset, files: [] };
    const update = vi.spyOn(store, 'updateAsset').mockResolvedValue(detail);
    const cover = new File(['cover'], 'pump-cover.png', { type: 'image/png' });
    const upload = vi
      .spyOn(store, 'uploadFile')
      .mockResolvedValue(completedTask('asset-1', cover));
    await flushPromises();

    selectUploadFile(wrapper, 1, cover);
    await wrapper.findAll('.el-dialog__footer button').at(-1)?.trigger('click');
    await flushPromises();

    expect(update).toHaveBeenCalledWith(
      'asset-1',
      expect.not.objectContaining({ coverAssetId: expect.anything() }),
    );
    expect(upload).toHaveBeenCalledTimes(1);
    expect(upload).toHaveBeenCalledWith(cover, {
      assetId: 'asset-1',
      purpose: 'cover',
    });
  });

  it('编辑保存刷新 asset 属性时仍上传提交开始时选择的封面', async () => {
    const { store, wrapper } = mountDialog({ modelValue: true, asset });
    const refreshedAsset: Asset = {
      ...asset,
      updatedAt: '2026-07-16T08:02:00.000Z',
    };
    vi.spyOn(store, 'updateAsset').mockImplementation(async () => {
      await wrapper.setProps({ asset: refreshedAsset });
      return { ...refreshedAsset, files: [] };
    });
    const cover = new File(['new-cover'], 'pump-new-cover.png', {
      type: 'image/png',
    });
    const upload = vi
      .spyOn(store, 'uploadFile')
      .mockResolvedValue(completedTask('asset-1', cover));
    await flushPromises();

    selectUploadFile(wrapper, 1, cover);
    await wrapper.findAll('.el-dialog__footer button').at(-1)?.trigger('click');
    await flushPromises();

    expect(upload).toHaveBeenCalledTimes(1);
    expect(upload).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'pump-new-cover.png' }),
      { assetId: 'asset-1', purpose: 'cover' },
    );
  });

  it('新建模型时先上传源文件再将封面绑定到返回的模型', async () => {
    const { store, wrapper } = mountDialog({ modelValue: true });
    const source = new File(['glb'], 'pump.glb', {
      type: 'model/gltf-binary',
    });
    const cover = new File(['cover'], 'pump-cover.webp', {
      type: 'image/webp',
    });
    const upload = vi
      .spyOn(store, 'uploadFile')
      .mockResolvedValueOnce(completedTask('asset-new', source))
      .mockResolvedValueOnce(completedTask('asset-new', cover));
    await flushPromises();

    selectUploadFile(wrapper, 0, source);
    selectUploadFile(wrapper, 1, cover);
    await wrapper.findAll('.el-dialog__footer button').at(-1)?.trigger('click');
    await flushPromises();

    expect(upload).toHaveBeenCalledTimes(2);
    expect(upload.mock.calls[0]?.[0]).toMatchObject({
      name: 'pump.glb',
      type: 'model/gltf-binary',
    });
    expect(upload.mock.calls[0]?.[1]).toEqual(
      expect.not.objectContaining({ coverAssetId: expect.anything() }),
    );
    expect(upload.mock.calls[1]).toEqual([
      cover,
      { assetId: 'asset-new', purpose: 'cover' },
    ]);
  });

  it('新建资源的封面失败后重试时不重复上传源文件', async () => {
    const { store, wrapper } = mountDialog({ modelValue: true });
    const source = new File(['glb'], 'pump.glb', {
      type: 'model/gltf-binary',
    });
    const cover = new File(['cover'], 'pump-cover.webp', {
      type: 'image/webp',
    });
    const upload = vi
      .spyOn(store, 'uploadFile')
      .mockResolvedValueOnce(completedTask('asset-new', source))
      .mockRejectedValueOnce(new Error('封面网络失败'))
      .mockResolvedValueOnce(completedTask('asset-new', cover));
    await flushPromises();

    selectUploadFile(wrapper, 0, source);
    selectUploadFile(wrapper, 1, cover);
    const saveButton = wrapper.findAll('.el-dialog__footer button').at(-1);
    await saveButton?.trigger('click');
    await flushPromises();
    expect(upload).toHaveBeenCalledTimes(2);

    await saveButton?.trigger('click');
    await flushPromises();

    expect(upload).toHaveBeenCalledTimes(3);
    expect(upload.mock.calls[2]).toEqual([
      cover,
      { assetId: 'asset-new', purpose: 'cover' },
    ]);
  });

  it('封面失败后更换源文件时替换已创建资源并保存新元数据', async () => {
    const { store, wrapper } = mountDialog({ modelValue: true });
    const source = new File(['glb-v1'], 'pump-v1.glb', {
      type: 'model/gltf-binary',
    });
    const replacement = new File(['glb-v2'], 'pump-v2.glb', {
      type: 'model/gltf-binary',
    });
    const cover = new File(['cover'], 'pump-cover.webp', {
      type: 'image/webp',
    });
    const upload = vi
      .spyOn(store, 'uploadFile')
      .mockResolvedValueOnce(completedTask('asset-new', source))
      .mockRejectedValueOnce(new Error('封面网络失败'))
      .mockResolvedValueOnce(completedTask('asset-new', replacement))
      .mockResolvedValueOnce(completedTask('asset-new', cover));
    await flushPromises();

    selectUploadFile(wrapper, 0, source);
    selectUploadFile(wrapper, 1, cover);
    const saveButton = wrapper.findAll('.el-dialog__footer button').at(-1);
    await saveButton?.trigger('click');
    await flushPromises();

    selectUploadFile(wrapper, 0, replacement);
    await wrapper
      .get('input[placeholder="例如：DEVICE-4x1 装配区"]')
      .setValue('水泵 V2');
    await saveButton?.trigger('click');
    await flushPromises();

    expect(upload).toHaveBeenCalledTimes(4);
    expect(upload.mock.calls[2]?.[0]).toMatchObject({
      name: 'pump-v2.glb',
      type: 'model/gltf-binary',
      size: replacement.size,
    });
    expect(upload.mock.calls[2]?.[1]).toEqual(
      expect.objectContaining({ assetId: 'asset-new', name: '水泵 V2' }),
    );
    expect(upload.mock.calls[3]).toEqual([
      cover,
      { assetId: 'asset-new', purpose: 'cover' },
    ]);
  });

  it('封面失败后只修改元数据时更新已创建资源再重试封面', async () => {
    const { store, wrapper } = mountDialog({ modelValue: true });
    const source = new File(['glb'], 'pump.glb', {
      type: 'model/gltf-binary',
    });
    const cover = new File(['cover'], 'pump-cover.webp', {
      type: 'image/webp',
    });
    const upload = vi
      .spyOn(store, 'uploadFile')
      .mockResolvedValueOnce(completedTask('asset-new', source))
      .mockRejectedValueOnce(new Error('封面网络失败'))
      .mockResolvedValueOnce(completedTask('asset-new', cover));
    const update = vi
      .spyOn(store, 'updateAsset')
      .mockResolvedValue({ ...asset, id: 'asset-new', files: [] });
    await flushPromises();

    selectUploadFile(wrapper, 0, source);
    selectUploadFile(wrapper, 1, cover);
    const saveButton = wrapper.findAll('.el-dialog__footer button').at(-1);
    await saveButton?.trigger('click');
    await flushPromises();

    await wrapper
      .get('input[placeholder="例如：DEVICE-4x1 装配区"]')
      .setValue('水泵元数据更新');
    await saveButton?.trigger('click');
    await flushPromises();

    expect(update).toHaveBeenCalledWith(
      'asset-new',
      expect.objectContaining({ name: '水泵元数据更新' }),
    );
    expect(upload).toHaveBeenCalledTimes(3);
    expect(upload.mock.calls[2]).toEqual([
      cover,
      { assetId: 'asset-new', purpose: 'cover' },
    ]);
  });
});
