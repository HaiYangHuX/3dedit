import { createHash } from 'node:crypto';
import { Readable } from 'node:stream';
import { describe, expect, it, vi } from 'vitest';
import { analyzeAsset } from '../src/jobs/analyzeAsset.js';
import { createMinimalGlb } from './fixtures.js';

describe('analyzeAsset', () => {
  it('流式校验 SHA-256、保存缩略图并原子提交解析结果', async () => {
    const source = createMinimalGlb();
    const expectedSha256 = createHash('sha256').update(source).digest('hex');
    const storage = {
      getObject: vi
        .fn()
        .mockResolvedValue(
          Readable.from([source.subarray(0, 31), source.subarray(31)]),
        ),
      putObject: vi.fn().mockResolvedValue(undefined),
    };
    const repository = {
      markProcessing: vi.fn().mockResolvedValue(undefined),
      markReady: vi.fn().mockResolvedValue(undefined),
      markFailed: vi.fn().mockResolvedValue(undefined),
    };

    const result = await analyzeAsset(
      {
        assetId: 'asset-1',
        fileId: 'file-1',
        objectKey: 'assets/asset-1/source/pump.glb',
        expectedSha256,
      },
      { storage, repository },
      'job-1',
    );

    expect(repository.markProcessing).toHaveBeenCalledWith('asset-1', 'job-1');
    expect(storage.putObject).toHaveBeenCalledWith(
      'assets/asset-1/thumbnail/file-1.svg',
      expect.any(Buffer),
      'image/svg+xml',
    );
    expect(repository.markReady).toHaveBeenCalledWith(
      expect.objectContaining({
        assetId: 'asset-1',
        fileId: 'file-1',
        sourceHash: expectedSha256,
        thumbnailKey: 'assets/asset-1/thumbnail/file-1.svg',
        metadata: expect.objectContaining({ vertexCount: 3, faceCount: 1 }),
      }),
    );
    expect(repository.markFailed).not.toHaveBeenCalled();
    expect(result.metadata).toMatchObject({ meshCount: 1, hasDraco: true });
  });

  it('哈希不一致时记录失败且不切换 activeFile', async () => {
    const source = createMinimalGlb();
    const repository = {
      markProcessing: vi.fn().mockResolvedValue(undefined),
      markReady: vi.fn(),
      markFailed: vi.fn().mockResolvedValue(undefined),
    };

    await expect(
      analyzeAsset(
        {
          assetId: 'asset-1',
          fileId: 'file-1',
          objectKey: 'assets/asset-1/source/pump.glb',
          expectedSha256: '0'.repeat(64),
        },
        {
          storage: {
            getObject: vi.fn().mockResolvedValue(Readable.from([source])),
            putObject: vi.fn(),
          },
          repository,
        },
        'job-1',
      ),
    ).rejects.toThrow('SHA-256');

    expect(repository.markFailed).toHaveBeenCalledWith(
      'asset-1',
      'job-1',
      expect.stringContaining('SHA-256'),
    );
    expect(repository.markReady).not.toHaveBeenCalled();
  });
});
