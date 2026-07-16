import { createHash } from 'node:crypto';
import type { ParsedAssetMetadata } from '../parsers/gltf.js';

function escapeXml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => {
    const entities: Record<string, string> = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&apos;',
    };
    return entities[character] ?? character;
  });
}

/**
 * Worker 不依赖原生 WebGL，先生成确定性的轻量 SVG 预览。
 * 同一源文件的颜色和内容稳定，便于 CDN 缓存；后续可无缝替换为离屏真实渲染器。
 */
export function createAssetThumbnail(
  sourceHash: string,
  fileName: string,
  metadata: ParsedAssetMetadata,
): Buffer {
  const hue = Number.parseInt(sourceHash.slice(0, 6), 16) % 360;
  const title = escapeXml(fileName.slice(0, 40));
  const subtitle = `${metadata.meshCount} Mesh · ${metadata.vertexCount.toLocaleString('en-US')} V`;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="360" viewBox="0 0 640 360">
  <defs><linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop stop-color="hsl(${hue} 52% 22%)"/><stop offset="1" stop-color="#111827"/></linearGradient></defs>
  <rect width="640" height="360" rx="24" fill="url(#bg)"/>
  <g transform="translate(320 145)" fill="none" stroke="hsl(${hue} 85% 72%)" stroke-width="6" stroke-linejoin="round">
    <path d="M0-82 72-42 0 0-72-42Z"/><path d="M-72-42V42L0 84V0M72-42V42L0 84"/>
  </g>
  <text x="32" y="306" fill="#f8fafc" font-family="system-ui,sans-serif" font-size="26" font-weight="650">${title}</text>
  <text x="32" y="336" fill="#cbd5e1" font-family="system-ui,sans-serif" font-size="17">${subtitle}</text>
</svg>`;
  // 显式经过 Buffer 可保证上传长度与 checksum 基于完全相同的字节序列。
  return Buffer.from(svg, 'utf8');
}

export function checksumThumbnail(thumbnail: Buffer): string {
  return createHash('sha256').update(thumbnail).digest('hex');
}
