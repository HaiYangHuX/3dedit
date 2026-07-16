import type { AssetDetail } from '@digital-twin/api-contracts';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { assetApi } from '../src/api/assets';
import { editorAssetResolver } from '../src/three/editorAssetResolver';

vi.mock('../src/api/assets', () => ({
  assetApi: { get: vi.fn() },
}));

const asset: AssetDetail = {
  id: 'asset-1',
  name: '水泵',
  kind: 'model',
  format: 'glb',
  status: 'ready',
  category: '设备',
  tags: [],
  favorite: false,
  sourceHash: 'b'.repeat(64),
  metadata: {},
  error: null,
  retryCount: 0,
  thumbnailUrl: null,
  sourceSize: 1024,
  referenceCount: 0,
  createdAt: '2026-07-16T08:00:00.000Z',
  updatedAt: '2026-07-16T08:00:00.000Z',
  files: [
    {
      id: 'old-source',
      role: 'source',
      objectKey: 'old.glb',
      mimeType: 'model/gltf-binary',
      size: 100,
      checksum: 'a'.repeat(64),
      downloadUrl: 'https://assets.test/old.glb',
    },
    {
      id: 'active-source',
      role: 'source',
      objectKey: 'pump.glb',
      mimeType: 'model/gltf-binary',
      size: 1024,
      checksum: 'b'.repeat(64),
      downloadUrl: 'https://assets.test/pump.glb',
    },
  ],
};

describe('editorAssetResolver', () => {
  beforeEach(() => vi.clearAllMocks());

  it('按 sourceHash 选择当前源文件，而不是误用旧的 source 记录', async () => {
    vi.mocked(assetApi.get).mockResolvedValue(asset);

    await expect(editorAssetResolver.resolve('asset-1')).resolves.toEqual({
      assetId: 'asset-1',
      name: '水泵',
      format: 'glb',
      url: 'https://assets.test/pump.glb',
    });
  });

  it('资源未就绪或当前源文件不可下载时返回可诊断错误', async () => {
    vi.mocked(assetApi.get).mockResolvedValue({
      ...asset,
      status: 'processing',
      files: [],
    });

    await expect(editorAssetResolver.resolve('asset-1')).rejects.toThrow(
      '资源尚未处理完成',
    );
  });

  it('允许场景环境通过同一 resolver 获取当前 HDR 源文件', async () => {
    vi.mocked(assetApi.get).mockResolvedValue({
      ...asset,
      id: 'environment-1',
      name: '厂区环境',
      kind: 'environment',
      format: 'hdr',
      sourceHash: 'c'.repeat(64),
      files: [
        {
          ...asset.files[1]!,
          id: 'environment-source',
          objectKey: 'factory.hdr',
          mimeType: 'image/vnd.radiance',
          checksum: 'c'.repeat(64),
          downloadUrl: 'https://assets.test/factory.hdr',
        },
      ],
    });

    await expect(
      editorAssetResolver.resolve('environment-1'),
    ).resolves.toMatchObject({
      format: 'hdr',
      url: 'https://assets.test/factory.hdr',
    });
  });

  it('允许材质系统解析 ready 图片的活动源文件', async () => {
    vi.mocked(assetApi.get).mockResolvedValue({
      ...asset,
      id: 'texture-1',
      name: '设备颜色',
      kind: 'image',
      format: 'png',
      sourceHash: 'd'.repeat(64),
      files: [
        {
          ...asset.files[1]!,
          id: 'texture-source',
          objectKey: 'color.png',
          mimeType: 'image/png',
          checksum: 'd'.repeat(64),
          downloadUrl: 'https://assets.test/color.png',
        },
      ],
    });

    await expect(
      editorAssetResolver.resolve('texture-1'),
    ).resolves.toMatchObject({
      format: 'png',
      url: 'https://assets.test/color.png',
    });
  });
});
