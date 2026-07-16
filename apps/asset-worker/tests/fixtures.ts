/** 构造无需外部二进制文件的最小 GLB，便于单元测试精确覆盖 header 和 JSON chunk。 */
export function createMinimalGlb(): Buffer {
  const document = {
    asset: { version: '2.0' },
    extensionsUsed: [
      'KHR_draco_mesh_compression',
      'EXT_meshopt_compression',
      'KHR_texture_basisu',
    ],
    buffers: [{ byteLength: 42 }],
    bufferViews: [
      { buffer: 0, byteOffset: 0, byteLength: 36 },
      { buffer: 0, byteOffset: 36, byteLength: 6 },
    ],
    accessors: [
      {
        bufferView: 0,
        componentType: 5126,
        count: 3,
        type: 'VEC3',
        min: [-1, 0, -2],
        max: [2, 3, 1],
      },
      { bufferView: 1, componentType: 5123, count: 3, type: 'SCALAR' },
    ],
    meshes: [{ primitives: [{ attributes: { POSITION: 0 }, indices: 1 }] }],
    materials: [{ name: 'Blue' }],
    textures: [{ source: 0 }],
    images: [{ uri: 'data:image/png;base64,' }],
    animations: [{ channels: [], samplers: [] }],
    cameras: [{ type: 'perspective', perspective: { yfov: 1, znear: 0.1 } }],
  };
  const json = Buffer.from(JSON.stringify(document), 'utf8');
  const jsonPadding = Buffer.alloc((4 - (json.length % 4)) % 4, 0x20);
  const jsonChunk = Buffer.concat([json, jsonPadding]);
  const binaryChunk = Buffer.alloc(44);
  const totalLength = 12 + 8 + jsonChunk.length + 8 + binaryChunk.length;
  const glb = Buffer.alloc(totalLength);

  glb.writeUInt32LE(0x46546c67, 0);
  glb.writeUInt32LE(2, 4);
  glb.writeUInt32LE(totalLength, 8);
  glb.writeUInt32LE(jsonChunk.length, 12);
  glb.writeUInt32LE(0x4e4f534a, 16);
  jsonChunk.copy(glb, 20);
  const binaryHeaderOffset = 20 + jsonChunk.length;
  glb.writeUInt32LE(binaryChunk.length, binaryHeaderOffset);
  glb.writeUInt32LE(0x004e4942, binaryHeaderOffset + 4);
  binaryChunk.copy(glb, binaryHeaderOffset + 8);
  return glb;
}
