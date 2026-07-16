export interface ParsedAssetMetadata {
  vertexCount: number;
  faceCount: number;
  meshCount: number;
  primitiveCount: number;
  materialCount: number;
  textureCount: number;
  animationCount: number;
  cameraCount: number;
  extensions: string[];
  bounds?: { min: [number, number, number]; max: [number, number, number] };
  hasDraco: boolean;
  hasMeshopt: boolean;
  hasKtx2: boolean;
  generator?: string;
}

type JsonRecord = Record<string, unknown>;

function asRecord(value: unknown): JsonRecord {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('glTF JSON 根节点必须是对象');
  }
  return value as JsonRecord;
}

function recordArray(value: unknown): JsonRecord[] {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (item): item is JsonRecord =>
      Boolean(item) && typeof item === 'object' && !Array.isArray(item),
  );
}

function countFromAccessor(accessors: JsonRecord[], index: unknown): number {
  if (typeof index !== 'number' || !Number.isInteger(index)) return 0;
  const count = accessors[index]?.count;
  return typeof count === 'number' && Number.isFinite(count) ? count : 0;
}

function triangleCount(vertexOrIndexCount: number, mode: unknown): number {
  // glTF mode 4 为 TRIANGLES，5/6 分别为 strip/fan；点线模式不计入面数。
  if (mode === undefined || mode === 4)
    return Math.floor(vertexOrIndexCount / 3);
  if (mode === 5 || mode === 6) return Math.max(0, vertexOrIndexCount - 2);
  return 0;
}

function readVector3(value: unknown): [number, number, number] | undefined {
  if (
    !Array.isArray(value) ||
    value.length < 3 ||
    !value
      .slice(0, 3)
      .every((item) => typeof item === 'number' && Number.isFinite(item))
  ) {
    return undefined;
  }
  return [value[0] as number, value[1] as number, value[2] as number];
}

/** 从 glTF JSON 统计模型库检索与详情展示所需的轻量元数据。 */
export function parseGltfDocument(value: unknown): ParsedAssetMetadata {
  const document = asRecord(value);
  const accessors = recordArray(document.accessors);
  const meshes = recordArray(document.meshes);
  let vertexCount = 0;
  let faceCount = 0;
  let primitiveCount = 0;
  let boundsMin: [number, number, number] | undefined;
  let boundsMax: [number, number, number] | undefined;

  for (const mesh of meshes) {
    for (const primitive of recordArray(mesh.primitives)) {
      primitiveCount += 1;
      const attributes =
        primitive.attributes &&
        typeof primitive.attributes === 'object' &&
        !Array.isArray(primitive.attributes)
          ? (primitive.attributes as JsonRecord)
          : {};
      const positionIndex = attributes.POSITION;
      const positions = countFromAccessor(accessors, positionIndex);
      const indices = countFromAccessor(accessors, primitive.indices);
      vertexCount += positions;
      faceCount += triangleCount(indices || positions, primitive.mode);

      if (typeof positionIndex !== 'number') continue;
      const accessor = accessors[positionIndex];
      const minimum = readVector3(accessor?.min);
      const maximum = readVector3(accessor?.max);
      if (!minimum || !maximum) continue;
      boundsMin ??= [...minimum];
      boundsMax ??= [...maximum];
      boundsMin = [
        Math.min(boundsMin[0], minimum[0]),
        Math.min(boundsMin[1], minimum[1]),
        Math.min(boundsMin[2], minimum[2]),
      ];
      boundsMax = [
        Math.max(boundsMax[0], maximum[0]),
        Math.max(boundsMax[1], maximum[1]),
        Math.max(boundsMax[2], maximum[2]),
      ];
    }
  }

  const extensions = Array.from(
    new Set(
      [document.extensionsUsed, document.extensionsRequired]
        .flatMap((item) => (Array.isArray(item) ? item : []))
        .filter((item): item is string => typeof item === 'string'),
    ),
  ).sort();
  const asset =
    document.asset &&
    typeof document.asset === 'object' &&
    !Array.isArray(document.asset)
      ? (document.asset as JsonRecord)
      : undefined;
  const metadata: ParsedAssetMetadata = {
    vertexCount,
    faceCount,
    meshCount: meshes.length,
    primitiveCount,
    materialCount: recordArray(document.materials).length,
    textureCount: recordArray(document.textures).length,
    animationCount: recordArray(document.animations).length,
    cameraCount: recordArray(document.cameras).length,
    extensions,
    hasDraco: extensions.includes('KHR_draco_mesh_compression'),
    hasMeshopt: extensions.includes('EXT_meshopt_compression'),
    hasKtx2: extensions.includes('KHR_texture_basisu'),
  };
  if (boundsMin && boundsMax)
    metadata.bounds = { min: boundsMin, max: boundsMax };
  if (typeof asset?.generator === 'string')
    metadata.generator = asset.generator;
  return metadata;
}

/** 外部 .gltf 文件是 UTF-8 JSON；资源依赖将在后续依赖解析阶段单独入库。 */
export function parseGltfJson(buffer: Buffer): ParsedAssetMetadata {
  try {
    return parseGltfDocument(JSON.parse(buffer.toString('utf8')) as unknown);
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new Error(`glTF JSON 无效: ${error.message}`, { cause: error });
    }
    throw error;
  }
}
