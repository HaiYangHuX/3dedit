import { describe, expect, it, vi } from 'vitest';
import { BUILTIN_ENVIRONMENT_ASSETS } from '@digital-twin/three-engine';
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

  it('preview 与 publication 都允许材质图片资源', async () => {
    const getAsset = vi.fn(async () => ({
      id: 'texture-1',
      name: '颜色贴图',
      kind: 'image',
      format: 'png',
      status: 'ready',
      sourceHash: 'texture-hash',
      files: [
        {
          role: 'source',
          checksum: 'texture-hash',
          downloadUrl: 'http://example.com/color.png',
        },
      ],
    }));
    const preview = createPreviewAssetResolver({ getAsset });
    const publication = createPublicationAssetResolver({
      'texture-1': {
        name: '颜色贴图',
        format: 'png',
        mimeType: 'image/png',
        size: 64,
        objectKey: 'publications/pub/assets/texture-1.png',
        url: '/api/publications/pub/assets/texture-1',
      },
    });

    await expect(preview.resolve('texture-1')).resolves.toMatchObject({
      format: 'png',
    });
    await expect(publication.resolve('texture-1')).resolves.toMatchObject({
      format: 'png',
    });
  });

  it('preview 与 publication 都能直接解析内置环境预设', async () => {
    // 预设清单为空属于引擎包契约错误，首项非空断言让测试聚焦解析协议。
    const preset = BUILTIN_ENVIRONMENT_ASSETS[0]!;
    const preview = createPreviewAssetResolver({
      getAsset: vi.fn(),
    });
    const publication = createPublicationAssetResolver({});

    await expect(preview.resolve(preset.id)).resolves.toEqual({
      assetId: preset.id,
      name: preset.name,
      format: preset.format,
      url: preset.url,
    });
    await expect(publication.resolve(preset.id)).resolves.toEqual({
      assetId: preset.id,
      name: preset.name,
      format: preset.format,
      url: preset.url,
    });
  });
});
