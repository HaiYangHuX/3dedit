import type { CompleteUploadInput } from '@digital-twin/api-contracts';

export interface MultipartUploadSession {
  partSize: number;
  partUrls: { partNumber: number; url: string }[];
}

export interface MultipartProgress {
  loaded: number;
  total: number;
  percent: number;
}

export interface MultipartUploadOptions {
  concurrency?: number;
  signal?: AbortSignal;
  fetcher?: (url: string, init?: RequestInit) => Promise<Response>;
  onProgress?: (progress: MultipartProgress) => void;
}

function normalizeEtag(value: string | null, partNumber: number): string {
  if (!value) throw new Error(`分片 ${partNumber} 响应缺少 ETag`);
  return value.replace(/^W\//, '').replace(/^"|"$/g, '');
}

/** 使用固定大小 worker 池限制浏览器并发，完成结果始终按 partNumber 排序。 */
export async function uploadMultipart(
  file: Blob,
  session: MultipartUploadSession,
  options: MultipartUploadOptions = {},
): Promise<CompleteUploadInput['parts']> {
  const fetcher = options.fetcher ?? ((url, init) => fetch(url, init));
  const concurrency = Math.max(1, Math.floor(options.concurrency ?? 3));
  const controller = new AbortController();
  const abort = () => controller.abort(options.signal?.reason);
  if (options.signal?.aborted) abort();
  else options.signal?.addEventListener('abort', abort, { once: true });

  const pending = [...session.partUrls].sort(
    (first, second) => first.partNumber - second.partNumber,
  );
  const results: CompleteUploadInput['parts'] = [];
  let nextIndex = 0;
  let loaded = 0;
  options.onProgress?.({ loaded: 0, total: file.size, percent: 0 });

  async function worker(): Promise<void> {
    while (nextIndex < pending.length) {
      const currentIndex = nextIndex;
      nextIndex += 1;
      const part = pending[currentIndex];
      if (!part) return;
      const start = (part.partNumber - 1) * session.partSize;
      const body = file.slice(
        start,
        Math.min(file.size, start + session.partSize),
      );
      const response = await fetcher(part.url, {
        method: 'PUT',
        body,
        signal: controller.signal,
      });
      if (!response.ok) {
        throw new Error(
          `分片 ${part.partNumber} 上传失败（${response.status}）`,
        );
      }
      results.push({
        partNumber: part.partNumber,
        etag: normalizeEtag(response.headers.get('etag'), part.partNumber),
      });
      loaded += body.size;
      options.onProgress?.({
        loaded,
        total: file.size,
        percent: file.size === 0 ? 100 : Math.round((loaded / file.size) * 100),
      });
    }
  }

  try {
    await Promise.all(
      Array.from({ length: Math.min(concurrency, pending.length) }, worker),
    );
  } catch (error) {
    // 任一分片失败时终止同批请求，避免继续消耗带宽并留下更多无效分片。
    controller.abort(error);
    throw error;
  } finally {
    options.signal?.removeEventListener('abort', abort);
  }
  return results.sort((first, second) => first.partNumber - second.partNumber);
}
