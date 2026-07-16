/** 为每次 E2E 生成唯一三角形 GLB，避免 sourceHash 去重命中历史数据。 */
export function createMinimalGlb(unique: string): Buffer {
  const document = {
    asset: { version: '2.0', generator: unique },
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [{ mesh: 0, name: `triangle-${unique}` }],
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
        min: [-1, 0, -1],
        max: [1, 2, 1],
      },
      { bufferView: 1, componentType: 5123, count: 3, type: 'SCALAR' },
    ],
    meshes: [{ primitives: [{ attributes: { POSITION: 0 }, indices: 1 }] }],
  };
  const json = Buffer.from(JSON.stringify(document));
  const jsonChunk = Buffer.concat([
    json,
    Buffer.alloc((4 - (json.length % 4)) % 4, 0x20),
  ]);
  const binary = Buffer.alloc(44);
  // 三个顶点形成立于 X/Y 平面的可见三角形。
  const positions = [0, 0, 0, 1, 0, 0, 0, 1, 0];
  positions.forEach((value, index) => binary.writeFloatLE(value, index * 4));
  binary.writeUInt16LE(0, 36);
  binary.writeUInt16LE(1, 38);
  binary.writeUInt16LE(2, 40);
  const total = 12 + 8 + jsonChunk.length + 8 + binary.length;
  const glb = Buffer.alloc(total);
  glb.writeUInt32LE(0x46546c67, 0);
  glb.writeUInt32LE(2, 4);
  glb.writeUInt32LE(total, 8);
  glb.writeUInt32LE(jsonChunk.length, 12);
  glb.writeUInt32LE(0x4e4f534a, 16);
  jsonChunk.copy(glb, 20);
  const binaryOffset = 20 + jsonChunk.length;
  glb.writeUInt32LE(binary.length, binaryOffset);
  glb.writeUInt32LE(0x004e4942, binaryOffset + 4);
  binary.copy(glb, binaryOffset + 8);
  return glb;
}
