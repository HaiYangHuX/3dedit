import type {
  Asset,
  AssetListResponse,
  UploadSession,
} from '@digital-twin/api-contracts';
import { createPinia, setActivePinia } from 'pinia';
import { nextTick, watchEffect } from 'vue';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { assetApi } from '../src/api/assets';
import { useAssetStore } from '../src/stores/asset';
import { hashFile } from '../src/uploads/hashFile';
import { uploadMultipart } from '../src/uploads/multipartUpload';

vi.mock('../src/api/assets', () => ({
  assetApi: {
    list: vi.fn(),
    get: vi.fn(),
    createUpload: vi.fn(),
    completeUpload: vi.fn(),
    cancelUpload: vi.fn(),
    update: vi.fn(),
    remove: vi.fn(),
    retry: vi.fn(),
  },
}));
vi.mock('../src/uploads/hashFile', () => ({ hashFile: vi.fn() }));
vi.mock('../src/uploads/multipartUpload', () => ({ uploadMultipart: vi.fn() }));

const asset: Asset = {
  id: 'asset-1',
  name: '水泵',
  kind: 'model',
  format: 'glb',
  status: 'ready',
  category: '设备',
  tags: ['泵'],
  favorite: false,
  sourceHash: 'a'.repeat(64),
  metadata: { vertexCount: 3, faceCount: 1 },
  error: null,
  retryCount: 0,
  thumbnailUrl: null,
  sourceSize: 1024,
  referenceCount: 0,
  createdAt: '2026-07-16T08:00:00.000Z',
  updatedAt: '2026-07-16T08:01:00.000Z',
};

describe('useAssetStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.clearAllMocks();
  });

  it('按筛选条件加载资源目录', async () => {
    const response: AssetListResponse = {
      items: [asset],
      total: 1,
      page: 1,
      pageSize: 24,
    };
    vi.mocked(assetApi.list).mockResolvedValue(response);
    const store = useAssetStore();
    store.filters.keyword = '泵';
    store.filters.favorite = true;

    await store.loadAssets();

    expect(assetApi.list).toHaveBeenCalledWith(
      expect.objectContaining({ keyword: '泵', favorite: true }),
    );
    expect(store.assets).toEqual([asset]);
    expect(store.total).toBe(1);
  });

  it('上传任务只保存文件描述并轮询到 ready', async () => {
    const file = new File(['glb'], 'pump.glb', { type: 'model/gltf-binary' });
    const session: UploadSession = {
      id: 'upload-1',
      assetId: 'asset-1',
      objectKey: 'assets/asset-1/source/pump.glb',
      partSize: 5 * 1024 * 1024,
      partCount: 1,
      partUrls: [{ partNumber: 1, url: 'https://minio.test/1' }],
      expiresAt: '2026-07-17T08:00:00.000Z',
    };
    vi.mocked(hashFile).mockResolvedValue('a'.repeat(64));
    vi.mocked(assetApi.createUpload).mockResolvedValue(session);
    vi.mocked(uploadMultipart).mockImplementation(
      async (_file, _session, options) => {
        options?.onProgress?.({
          loaded: file.size,
          total: file.size,
          percent: 100,
        });
        return [{ partNumber: 1, etag: 'etag-1' }];
      },
    );
    vi.mocked(assetApi.completeUpload).mockResolvedValue({
      assetId: 'asset-1',
      fileId: 'file-1',
      jobId: 'job-1',
      status: 'queued',
    });
    vi.mocked(assetApi.get).mockResolvedValue({ ...asset, files: [] });
    vi.mocked(assetApi.list).mockResolvedValue({
      items: [asset],
      total: 1,
      page: 1,
      pageSize: 24,
    });
    const store = useAssetStore();
    let observedAssetCount = -1;
    const stop = watchEffect(() => {
      observedAssetCount = store.assets.length;
    });

    const completed = await store.uploadFile(file, { pollInterval: 0 });
    await nextTick();

    expect(completed.status).toBe('ready');
    expect(completed.fileName).toBe('pump.glb');
    expect('file' in completed).toBe(false);
    expect(store.uploadTasks[0]).toMatchObject({
      progress: 100,
      assetId: 'asset-1',
    });
    expect(observedAssetCount).toBe(1);
    stop();
  });

  it('封面上传完成后直接刷新原模型且不进入解析状态', async () => {
    const file = new File(['cover'], 'pump-cover.png', { type: 'image/png' });
    const session: UploadSession = {
      id: 'cover-upload-1',
      assetId: 'asset-1',
      objectKey: 'assets/asset-1/cover/pump-cover.png',
      partSize: 5 * 1024 * 1024,
      partCount: 1,
      partUrls: [{ partNumber: 1, url: 'https://minio.test/cover/1' }],
      expiresAt: '2026-07-17T08:00:00.000Z',
    };
    const detail = {
      ...asset,
      coverUrl: 'https://assets.test/pump-cover.png',
      files: [],
    };
    let resolveDetail: ((value: typeof detail) => void) | undefined;
    const detailPromise = new Promise<typeof detail>((resolve) => {
      resolveDetail = resolve;
    });
    vi.mocked(hashFile).mockResolvedValue('a'.repeat(64));
    vi.mocked(assetApi.createUpload).mockResolvedValue(session);
    vi.mocked(uploadMultipart).mockResolvedValue([
      { partNumber: 1, etag: 'etag-cover-1' },
    ]);
    vi.mocked(assetApi.completeUpload).mockResolvedValue({
      assetId: 'asset-1',
      fileId: 'cover-file-1',
      status: 'ready',
    });
    vi.mocked(assetApi.get).mockReturnValue(detailPromise);
    const store = useAssetStore();
    store.assets = [asset];

    const upload = store.uploadFile(file, {
      assetId: 'asset-1',
      purpose: 'cover',
    });
    await vi.waitFor(() => expect(assetApi.get).toHaveBeenCalledTimes(1));

    expect(store.uploadTasks[0]?.status).toBe('uploading');
    resolveDetail?.(detail);
    const completed = await upload;

    expect(assetApi.createUpload).toHaveBeenCalledWith(
      expect.objectContaining({
        assetId: 'asset-1',
        purpose: 'cover',
      }),
    );
    expect(assetApi.get).toHaveBeenCalledTimes(1);
    expect(completed.status).toBe('ready');
    expect(store.assets).toHaveLength(1);
    expect(store.assets[0]).toMatchObject({
      id: 'asset-1',
      coverUrl: 'https://assets.test/pump-cover.png',
    });
    expect(store.assets[0]).not.toHaveProperty('files');
  });

  it('服务端取消失败时保留重试入口并在再次取消后完成', async () => {
    const file = new File(['glb'], 'pump.glb', {
      type: 'model/gltf-binary',
    });
    const session: UploadSession = {
      id: 'upload-1',
      assetId: 'asset-1',
      objectKey: 'assets/asset-1/source/pump.glb',
      partSize: 5 * 1024 * 1024,
      partCount: 1,
      partUrls: [{ partNumber: 1, url: 'https://minio.test/1' }],
      expiresAt: '2026-07-17T08:00:00.000Z',
    };
    vi.mocked(hashFile).mockResolvedValue('a'.repeat(64));
    vi.mocked(assetApi.createUpload).mockResolvedValue(session);
    vi.mocked(uploadMultipart).mockImplementation(
      (_file, _session, options) =>
        new Promise((_resolve, reject) => {
          options?.signal?.addEventListener(
            'abort',
            () => reject(new DOMException('Aborted', 'AbortError')),
            { once: true },
          );
        }),
    );
    vi.mocked(assetApi.cancelUpload)
      .mockRejectedValueOnce(new Error('取消服务暂不可用'))
      .mockResolvedValueOnce(undefined);
    const store = useAssetStore();

    const upload = store.uploadFile(file);
    await vi.waitFor(() =>
      expect(store.uploadTasks[0]?.status).toBe('uploading'),
    );
    const task = store.uploadTasks[0];
    expect(task).toBeDefined();
    store.cancelUploadTask(task!.id);

    await expect(upload).rejects.toThrow('取消服务暂不可用');
    expect(task).toMatchObject({
      status: 'uploading',
      error: '取消失败：取消服务暂不可用',
    });

    store.cancelUploadTask(task!.id);
    await vi.waitFor(() => expect(task?.status).toBe('cancelled'));
    expect(assetApi.cancelUpload).toHaveBeenCalledTimes(2);
    expect(task?.error).toBe('上传已取消');
  });
});
