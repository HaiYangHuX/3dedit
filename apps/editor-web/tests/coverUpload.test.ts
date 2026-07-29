import type { UploadSession } from '@digital-twin/api-contracts';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { assetApi } from '../src/api/assets';
import { uploadCoverFile } from '../src/uploads/coverUpload';
import { hashFile } from '../src/uploads/hashFile';
import { uploadMultipart } from '../src/uploads/multipartUpload';

vi.mock('../src/api/assets', () => ({
  assetApi: {
    createUpload: vi.fn(),
    completeUpload: vi.fn(),
    cancelUpload: vi.fn(),
  },
}));
vi.mock('../src/uploads/hashFile', () => ({ hashFile: vi.fn() }));
vi.mock('../src/uploads/multipartUpload', () => ({ uploadMultipart: vi.fn() }));

describe('uploadCoverFile', () => {
  beforeEach(() => vi.clearAllMocks());

  it('上传项目封面时不携带素材编号或素材元数据', async () => {
    const file = new File(['cover'], 'project-cover.png', {
      type: 'image/png',
    });
    const session: UploadSession = {
      id: 'upload-1',
      assetId: null,
      objectKey: 'covers/projects/project-cover.png',
      partSize: 5 * 1024 * 1024,
      partCount: 1,
      partUrls: [{ partNumber: 1, url: 'https://minio.test/part/1' }],
      expiresAt: '2026-07-30T08:00:00.000Z',
    };
    vi.mocked(hashFile).mockResolvedValue('a'.repeat(64));
    vi.mocked(assetApi.createUpload).mockResolvedValue(session);
    vi.mocked(uploadMultipart).mockResolvedValue([
      { partNumber: 1, etag: 'etag-1' },
    ]);
    vi.mocked(assetApi.completeUpload).mockResolvedValue({
      objectKey: session.objectKey,
      url: 'https://assets.test/project-cover.png',
      status: 'stored',
    });

    await expect(uploadCoverFile(file, 'project-cover')).resolves.toEqual({
      objectKey: session.objectKey,
      url: 'https://assets.test/project-cover.png',
    });
    expect(assetApi.createUpload).toHaveBeenCalledWith({
      fileName: file.name,
      size: file.size,
      sha256: 'a'.repeat(64),
      mimeType: 'image/png',
      purpose: 'project-cover',
    });
    expect(assetApi.cancelUpload).not.toHaveBeenCalled();
  });
});
