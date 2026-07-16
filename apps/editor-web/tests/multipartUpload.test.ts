import { describe, expect, it, vi } from 'vitest';
import { uploadMultipart } from '../src/uploads/multipartUpload';

describe('uploadMultipart', () => {
  it('以三路并发上传 13 MiB、去除 ETag 引号并单调报告总进度', async () => {
    const file = new Blob([new Uint8Array(13 * 1024 * 1024)]);
    let active = 0;
    let maxActive = 0;
    const fetcher = vi.fn(async (_url: string, init?: RequestInit) => {
      active += 1;
      maxActive = Math.max(maxActive, active);
      expect(init?.method).toBe('PUT');
      await new Promise((resolve) => setTimeout(resolve, 5));
      active -= 1;
      const part = String(_url).split('/').at(-1);
      return new Response(null, {
        status: 200,
        headers: { ETag: `"etag-${part}"` },
      });
    });
    const progress: number[] = [];

    const parts = await uploadMultipart(
      file,
      {
        partSize: 5 * 1024 * 1024,
        partUrls: [1, 2, 3].map((partNumber) => ({
          partNumber,
          url: `https://minio.test/${partNumber}`,
        })),
      },
      {
        concurrency: 3,
        fetcher,
        onProgress: ({ percent }) => progress.push(percent),
      },
    );

    expect(maxActive).toBe(3);
    expect(parts).toEqual([
      { partNumber: 1, etag: 'etag-1' },
      { partNumber: 2, etag: 'etag-2' },
      { partNumber: 3, etag: 'etag-3' },
    ]);
    expect(progress.at(-1)).toBe(100);
    expect(
      progress.every(
        (value, index) => index === 0 || value >= progress[index - 1]!,
      ),
    ).toBe(true);
  });

  it('AbortSignal 会中止所有仍在执行的 fetch', async () => {
    const controller = new AbortController();
    const fetcher = vi.fn(
      (_url: string, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => {
            reject(new DOMException('Aborted', 'AbortError'));
          });
        }),
    );
    const uploading = uploadMultipart(
      new Blob([new Uint8Array(11 * 1024 * 1024)]),
      {
        partSize: 5 * 1024 * 1024,
        partUrls: [1, 2, 3].map((partNumber) => ({
          partNumber,
          url: `https://minio.test/${partNumber}`,
        })),
      },
      { concurrency: 3, fetcher, signal: controller.signal },
    );

    await vi.waitFor(() => expect(fetcher).toHaveBeenCalledTimes(3));
    controller.abort();

    await expect(uploading).rejects.toMatchObject({ name: 'AbortError' });
  });
});
