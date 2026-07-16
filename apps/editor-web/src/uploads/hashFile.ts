import { createSHA256 } from 'hash-wasm';

const HASH_CHUNK_SIZE = 4 * 1024 * 1024;

export interface HashFileOptions {
  signal?: AbortSignal;
  onProgress?: (percent: number) => void;
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
}

/** 分块读取浏览器 File，避免为计算 SHA-256 再复制一份完整的大文件到内存。 */
export async function hashFile(
  file: Blob,
  options: HashFileOptions = {},
): Promise<string> {
  const hasher = await createSHA256();
  hasher.init();
  let offset = 0;
  options.onProgress?.(0);
  while (offset < file.size) {
    throwIfAborted(options.signal);
    const end = Math.min(file.size, offset + HASH_CHUNK_SIZE);
    const chunk = new Uint8Array(await file.slice(offset, end).arrayBuffer());
    throwIfAborted(options.signal);
    hasher.update(chunk);
    offset = end;
    options.onProgress?.(
      file.size === 0 ? 100 : Math.round((offset / file.size) * 100),
    );
  }
  return hasher.digest('hex');
}
