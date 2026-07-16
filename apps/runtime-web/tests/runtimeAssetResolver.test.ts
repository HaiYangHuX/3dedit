import { describe, expect, it, vi } from 'vitest';
import {
  createPreviewAssetResolver,
  createPublicationAssetResolver,
} from '../src/runtime/runtimeAssetResolver.js';

describe('运行时资源解析器', () => {
  it('preview 只选择当前 ready 模型的活动源文件', async () => {
    const getAsset = vi.fn(async () => ({
      id: 'asset-1',
      name: '设备',
      kind: 'model' as const,
      format: 'glb' as const,
      status: 'ready' as const,
      sourceHash: 'hash-new',
      files: [
        {
          role: 'source',
          checksum: 'hash-old',
          downloadUrl: 'http://example.com/old.glb',
        },
        {
          role: 'source',
          checksum: 'hash-new',
          downloadUrl: 'http://example.com/current.glb',
        },
      ],
    }));
    const resolver = createPreviewAssetResolver({ getAsset });

    await expect(resolver.resolve('asset-1')).resolves.toEqual({
      assetId: 'asset-1',
      name: '设备',
      format: 'glb',
      url: 'http://example.com/current.glb',
    });
  });

  it('publication 只能读取 Manifest 中的独立发布资源', async () => {
    const resolver = createPublicationAssetResolver({
      'asset-1': {
        name: '发布设备',
        format: 'glb',
        mimeType: 'model/gltf-binary',
        size: 128,
        objectKey: 'publications/pub/releases/release/assets/asset-1.glb',
        url: '/api/publications/pub/assets/asset-1',
      },
    });

    await expect(resolver.resolve('asset-1')).resolves.toMatchObject({
      name: '发布设备',
      format: 'glb',
      url: '/api/publications/pub/assets/asset-1',
    });
    await expect(resolver.resolve('missing')).rejects.toThrow(
      '发布包未包含资源',
    );
  });
});
