import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('编辑器默认 HDR 静态资源', () => {
  it('交付与 Three.js r183 官方示例完全一致的 Venice 环境', () => {
    // Vitest 的 happy-dom 会将 import.meta.url 映射为浏览器 URL，静态资源校验改用包工作目录。
    const bytes = readFileSync(
      resolve(process.cwd(), 'public/hdr/venice_sunset_1k.hdr'),
    );
    expect(createHash('sha256').update(bytes).digest('hex')).toBe(
      '0e72ed46b5316cb5fb67fc81ff85b024a09146fd89ef3811a8d2299647ada118',
    );
  });
});
