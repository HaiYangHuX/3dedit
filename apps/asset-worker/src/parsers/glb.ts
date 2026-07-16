import { parseGltfDocument, type ParsedAssetMetadata } from './gltf.js';

const GLB_MAGIC = 0x46546c67;
const JSON_CHUNK_TYPE = 0x4e4f534a;

/** 验证 GLB v2 容器并解析首个 JSON chunk；几何 BIN 无需载入 Three.js 即可完成统计。 */
export function parseGlb(
  buffer: Buffer,
  actualFileLength = buffer.length,
): ParsedAssetMetadata {
  if (buffer.length < 20)
    throw new Error('GLB 长度不足，缺少 header 或 JSON chunk');
  if (buffer.readUInt32LE(0) !== GLB_MAGIC) throw new Error('GLB magic 无效');
  if (buffer.readUInt32LE(4) !== 2) throw new Error('仅支持 GLB 版本 2');
  const declaredLength = buffer.readUInt32LE(8);
  if (declaredLength !== actualFileLength) {
    throw new Error(
      `GLB 声明长度 ${declaredLength} 与文件长度 ${actualFileLength} 不一致`,
    );
  }
  const jsonLength = buffer.readUInt32LE(12);
  if (buffer.readUInt32LE(16) !== JSON_CHUNK_TYPE) {
    throw new Error('GLB 首个 chunk 必须为 JSON');
  }
  const jsonEnd = 20 + jsonLength;
  if (jsonEnd > buffer.length) throw new Error('GLB JSON chunk 长度越界');
  try {
    return parseGltfDocument(
      JSON.parse(
        buffer.subarray(20, jsonEnd).toString('utf8').trimEnd(),
      ) as unknown,
    );
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new Error(`GLB JSON 无效: ${error.message}`, { cause: error });
    }
    throw error;
  }
}
