import { createHash } from 'node:crypto';
import {
  analyzeAssetJobDataSchema,
  type AnalyzeAssetJobData,
} from '@digital-twin/api-contracts';
import { parseGlb } from '../parsers/glb.js';
import { parseGltfJson, type ParsedAssetMetadata } from '../parsers/gltf.js';
import {
  checksumThumbnail,
  createAssetThumbnail,
} from '../thumbnail/createAssetThumbnail.js';

const MAX_GLTF_JSON_SIZE = 64 * 1024 * 1024;

export interface AssetStorage {
  getObject(objectKey: string): Promise<AsyncIterable<Uint8Array | string>>;
  putObject(objectKey: string, body: Buffer, mimeType: string): Promise<void>;
}

export interface ReadyAssetInput {
  assetId: string;
  fileId: string;
  sourceHash: string;
  metadata: ParsedAssetMetadata & { byteLength: number; format: string };
  thumbnailKey: string;
  thumbnailSize: number;
  thumbnailChecksum: string;
  processingJobId?: string;
}

export interface AssetAnalysisRepository {
  markProcessing(assetId: string, processingJobId?: string): Promise<void>;
  markReady(input: ReadyAssetInput): Promise<void>;
  markFailed(
    assetId: string,
    processingJobId: string | undefined,
    error: string,
  ): Promise<void>;
}

export interface AnalyzeAssetDependencies {
  storage: AssetStorage;
  repository: AssetAnalysisRepository;
}

interface SourceAnalysis {
  sourceHash: string;
  byteLength: number;
  metadata: ParsedAssetMetadata & { byteLength: number; format: string };
}

function emptyMetadata(): ParsedAssetMetadata {
  return {
    vertexCount: 0,
    faceCount: 0,
    meshCount: 0,
    primitiveCount: 0,
    materialCount: 0,
    textureCount: 0,
    animationCount: 0,
    cameraCount: 0,
    extensions: [],
    hasDraco: false,
    hasMeshopt: false,
    hasKtx2: false,
  };
}

function extensionOf(objectKey: string): string {
  return objectKey.split('.').at(-1)?.toLowerCase() ?? '';
}

/**
 * GLB 只保留 header 与 JSON chunk，外部 glTF 则限制 JSON 最大 64 MiB。
 * 所有字节仍流经 hash，因此大模型不会因校验而整体驻留内存。
 */
async function analyzeSource(
  stream: AsyncIterable<Uint8Array | string>,
  format: string,
): Promise<SourceAnalysis> {
  const hash = createHash('sha256');
  const parseChunks: Buffer[] = [];
  let parseLength = 0;
  let glbTargetLength: number | undefined;
  let byteLength = 0;

  for await (const rawChunk of stream) {
    const chunk =
      typeof rawChunk === 'string'
        ? Buffer.from(rawChunk)
        : Buffer.from(rawChunk);
    hash.update(chunk);
    byteLength += chunk.length;
    if (format !== 'glb' && format !== 'gltf') continue;

    const limit = glbTargetLength ?? MAX_GLTF_JSON_SIZE;
    if (parseLength < limit) {
      const retained = chunk.subarray(0, Math.max(0, limit - parseLength));
      parseChunks.push(retained);
      parseLength += retained.length;
    }
    if (
      format === 'glb' &&
      glbTargetLength === undefined &&
      parseLength >= 20
    ) {
      const prefix = Buffer.concat(parseChunks, parseLength);
      glbTargetLength = 20 + prefix.readUInt32LE(12);
      if (glbTargetLength > MAX_GLTF_JSON_SIZE) {
        throw new Error('GLB JSON chunk 超过 64 MiB 安全上限');
      }
      if (parseLength > glbTargetLength) {
        parseChunks.length = 0;
        parseChunks.push(prefix.subarray(0, glbTargetLength));
        parseLength = glbTargetLength;
      }
    }
    if (format === 'gltf' && parseLength >= MAX_GLTF_JSON_SIZE) {
      throw new Error('glTF JSON 超过 64 MiB 安全上限');
    }
  }

  const parseBuffer = Buffer.concat(parseChunks, parseLength);
  let parsed = emptyMetadata();
  if (format === 'glb') parsed = parseGlb(parseBuffer, byteLength);
  if (format === 'gltf') parsed = parseGltfJson(parseBuffer);
  return {
    sourceHash: hash.digest('hex'),
    byteLength,
    metadata: { ...parsed, byteLength, format },
  };
}

/** 解析任务的纯编排入口，数据库与 MinIO 通过接口注入以便可靠测试。 */
export async function analyzeAsset(
  unsafeData: AnalyzeAssetJobData,
  dependencies: AnalyzeAssetDependencies,
  processingJobId?: string,
): Promise<SourceAnalysis> {
  const data = analyzeAssetJobDataSchema.parse(unsafeData);
  await dependencies.repository.markProcessing(data.assetId, processingJobId);
  try {
    const stream = await dependencies.storage.getObject(data.objectKey);
    const result = await analyzeSource(stream, extensionOf(data.objectKey));
    if (result.sourceHash !== data.expectedSha256.toLowerCase()) {
      throw new Error(
        `源文件 SHA-256 校验失败：期望 ${data.expectedSha256}，实际 ${result.sourceHash}`,
      );
    }

    const fileName = data.objectKey.split('/').at(-1) ?? 'asset';
    const thumbnail = createAssetThumbnail(
      result.sourceHash,
      fileName,
      result.metadata,
    );
    const thumbnailKey = `assets/${data.assetId}/thumbnail/${data.fileId}.svg`;
    await dependencies.storage.putObject(
      thumbnailKey,
      thumbnail,
      'image/svg+xml',
    );
    await dependencies.repository.markReady({
      assetId: data.assetId,
      fileId: data.fileId,
      sourceHash: result.sourceHash,
      metadata: result.metadata,
      thumbnailKey,
      thumbnailSize: thumbnail.length,
      thumbnailChecksum: checksumThumbnail(thumbnail),
      processingJobId,
    });
    return result;
  } catch (error) {
    const message = error instanceof Error ? error.message : '未知资源解析错误';
    // 失败路径绝不调用 markReady，因而不会把损坏的新文件切换为 activeFile。
    await dependencies.repository.markFailed(
      data.assetId,
      processingJobId,
      message,
    );
    throw error;
  }
}
