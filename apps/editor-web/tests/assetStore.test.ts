import type {
  Asset,
  AssetListResponse,
  UploadSession,
} from '@digital-twin/api-contracts';
import { createPinia, setActivePinia } from 'pinia';
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

    const completed = await store.uploadFile(file, { pollInterval: 0 });

    expect(completed.status).toBe('ready');
    expect(completed.fileName).toBe('pump.glb');
    expect('file' in completed).toBe(false);
    expect(store.uploadTasks[0]).toMatchObject({
      progress: 100,
      assetId: 'asset-1',
    });
  });
});
