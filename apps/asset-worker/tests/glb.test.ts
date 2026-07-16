import { describe, expect, it } from 'vitest';
import { parseGlb } from '../src/parsers/glb.js';
import { createMinimalGlb } from './fixtures.js';

describe('parseGlb', () => {
  it('解析 mesh、几何统计、包围盒和压缩扩展', () => {
    const result = parseGlb(createMinimalGlb());

    expect(result).toMatchObject({
      vertexCount: 3,
      faceCount: 1,
      meshCount: 1,
      materialCount: 1,
      textureCount: 1,
      animationCount: 1,
      cameraCount: 1,
      bounds: { min: [-1, 0, -2], max: [2, 3, 1] },
      hasDraco: true,
      hasMeshopt: true,
      hasKtx2: true,
    });
  });

  it('拒绝错误 magic、版本和声明长度', () => {
    const badMagic = createMinimalGlb();
    badMagic.writeUInt32LE(0, 0);
    expect(() => parseGlb(badMagic)).toThrow('magic');

    const badVersion = createMinimalGlb();
    badVersion.writeUInt32LE(1, 4);
    expect(() => parseGlb(badVersion)).toThrow('版本');

    const badLength = createMinimalGlb();
    badLength.writeUInt32LE(badLength.length + 4, 8);
    expect(() => parseGlb(badLength)).toThrow('长度');
  });
});
