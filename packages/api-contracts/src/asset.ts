import { z } from 'zod';

export const assetFormatSchema = z.enum([
  'glb',
  'gltf',
  'fbx',
  'obj',
  'stl',
  'usdz',
  'hdr',
  'png',
  'jpg',
  'jpeg',
  'webp',
  'svg',
  'mp4',
  'webm',
]);
export const assetKindSchema = z.enum([
  'model',
  'image',
  'texture',
  'environment',
  'video',
  'icon',
]);
export const assetStatusSchema = z.enum([
  'uploading',
  'queued',
  'processing',
  'ready',
  'failed',
]);
export const assetVisibilitySchema = z.enum(['private', 'team', 'public']);

export type AssetFormat = z.infer<typeof assetFormatSchema>;
export type AssetKind = z.infer<typeof assetKindSchema>;
export type AssetStatus = z.infer<typeof assetStatusSchema>;
export type AssetVisibility = z.infer<typeof assetVisibilitySchema>;

const modelFormats = new Set<AssetFormat>([
  'glb',
  'gltf',
  'fbx',
  'obj',
  'stl',
  'usdz',
]);
const imageFormats = new Set<AssetFormat>(['png', 'jpg', 'jpeg', 'webp']);

/** 上传类型由扩展名决定，不信任浏览器可伪造的 MIME。 */
function kindForFormat(format: AssetFormat): AssetKind {
  if (modelFormats.has(format)) return 'model';
  if (imageFormats.has(format)) return 'image';
  if (format === 'hdr') return 'environment';
  if (format === 'mp4' || format === 'webm') return 'video';
  return 'icon';
}

const uploadInputBaseSchema = z.object({
  fileName: z.string().trim().min(1).max(255),
  size: z
    .number()
    .int()
    .positive()
    .max(100 * 1024 * 1024 * 1024),
  sha256: z
    .string()
    .regex(/^[a-f\d]{64}$/i)
    .transform((value) => value.toLowerCase()),
  mimeType: z.string().trim().min(1).max(120),
  name: z.string().trim().min(1).max(120).optional(),
  code: z.string().trim().max(80).optional(),
  description: z.string().trim().max(1_000).optional(),
  // 版本只作为普通资产字段保存，不参与上传会话或版本状态流转。
  version: z.string().trim().max(40).optional(),
  author: z.string().trim().max(120).optional(),
  manufacturer: z.string().trim().max(120).optional(),
  license: z.string().trim().max(120).optional(),
  unit: z.string().trim().max(20).optional(),
  scale: z.number().positive().finite().optional(),
  visibility: assetVisibilitySchema.optional(),
  coverAssetId: z.string().trim().min(1).nullable().optional(),
  category: z.string().trim().min(1).max(80).optional().default('未分类'),
  tags: z
    .array(z.string().trim().min(1).max(40))
    .max(20)
    .optional()
    .default([]),
  assetId: z.string().min(1).optional(),
});

export const createUploadInputSchema = uploadInputBaseSchema.transform(
  (input, context) => {
    const extension = input.fileName.split('.').at(-1)?.toLowerCase();
    const parsedFormat = assetFormatSchema.safeParse(extension);
    if (!parsedFormat.success) {
      context.addIssue({ code: 'custom', message: '不支持的资源文件格式' });
      return z.NEVER;
    }
    const baseName = input.fileName.replace(/\.[^.]+$/, '');
    return {
      ...input,
      name: input.name ?? baseName,
      format: parsedFormat.data,
      kind: kindForFormat(parsedFormat.data),
    };
  },
);

export const completeUploadInputSchema = z
  .object({
    parts: z
      .array(
        z.object({
          partNumber: z.number().int().min(1).max(10_000),
          etag: z.string().trim().min(1),
        }),
      )
      .min(1)
      .max(10_000),
  })
  .superRefine(({ parts }, context) => {
    if (
      new Set(parts.map(({ partNumber }) => partNumber)).size !== parts.length
    ) {
      context.addIssue({ code: 'custom', message: 'partNumber 不能重复' });
    }
  })
  .transform(({ parts }) => ({
    parts: [...parts].sort(
      (first, second) => first.partNumber - second.partNumber,
    ),
  }));

export const listAssetsQuerySchema = z.object({
  page: z.coerce.number().int().positive().optional().default(1),
  pageSize: z.coerce.number().int().min(1).max(100).optional().default(24),
  keyword: z.string().trim().max(120).optional().default(''),
  kind: assetKindSchema.optional(),
  category: z.string().trim().max(80).optional(),
  status: assetStatusSchema.optional(),
  favorite: z
    .enum(['true', 'false'])
    .transform((value) => value === 'true')
    .optional(),
});

export const updateAssetInputSchema = z
  .object({
    name: z.string().trim().min(1).max(120).optional(),
    code: z.string().trim().max(80).optional(),
    description: z.string().trim().max(1_000).optional(),
    category: z.string().trim().min(1).max(80).optional(),
    tags: z.array(z.string().trim().min(1).max(40)).max(20).optional(),
    favorite: z.boolean().optional(),
    version: z.string().trim().max(40).optional(),
    author: z.string().trim().max(120).optional(),
    manufacturer: z.string().trim().max(120).optional(),
    license: z.string().trim().max(120).optional(),
    unit: z.string().trim().max(20).optional(),
    scale: z.number().positive().finite().optional(),
    visibility: assetVisibilitySchema.optional(),
    coverAssetId: z.string().trim().min(1).nullable().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: '至少需要修改一个资源字段',
  });

export const assetMetadataSchema = z
  .object({
    vertexCount: z.number().int().nonnegative().optional(),
    faceCount: z.number().int().nonnegative().optional(),
    meshCount: z.number().int().nonnegative().optional(),
    materialCount: z.number().int().nonnegative().optional(),
    textureCount: z.number().int().nonnegative().optional(),
    animationCount: z.number().int().nonnegative().optional(),
    cameraCount: z.number().int().nonnegative().optional(),
    extensions: z.array(z.string()).optional(),
  })
  .catchall(z.json());

export const assetFileSchema = z.object({
  id: z.string().min(1),
  role: z.string().min(1),
  objectKey: z.string().min(1),
  mimeType: z.string().min(1),
  size: z.number().nonnegative(),
  checksum: z.string(),
  downloadUrl: z.string().url().optional(),
});

export const assetSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  // 新字段采用可选形式解析旧项目导出的 DTO；新 API 始终会返回完整值。
  code: z.string().optional(),
  description: z.string().optional(),
  kind: assetKindSchema,
  format: assetFormatSchema,
  status: assetStatusSchema,
  category: z.string(),
  tags: z.array(z.string()),
  favorite: z.boolean(),
  version: z.string().optional(),
  author: z.string().optional(),
  manufacturer: z.string().optional(),
  license: z.string().optional(),
  unit: z.string().optional(),
  scale: z.number().positive().optional(),
  visibility: assetVisibilitySchema.optional(),
  coverAssetId: z.string().nullable().optional(),
  coverUrl: z.string().url().nullable().optional(),
  sourceHash: z.string(),
  metadata: assetMetadataSchema,
  error: z.string().nullable(),
  retryCount: z.number().int().nonnegative(),
  thumbnailUrl: z.string().url().nullable(),
  sourceSize: z.number().nonnegative(),
  referenceCount: z.number().int().nonnegative(),
  createdAt: z.string().datetime({ offset: true }),
  updatedAt: z.string().datetime({ offset: true }),
});

export const assetDetailSchema = assetSchema.extend({
  files: z.array(assetFileSchema),
});

export const assetListResponseSchema = z.object({
  items: z.array(assetSchema),
  total: z.number().int().nonnegative(),
  page: z.number().int().positive(),
  pageSize: z.number().int().positive(),
});

export const uploadSessionSchema = z.object({
  id: z.string().min(1),
  assetId: z.string().min(1),
  objectKey: z.string().min(1),
  partSize: z.number().int().positive(),
  partCount: z.number().int().positive(),
  partUrls: z.array(
    z.object({
      partNumber: z.number().int().positive(),
      url: z.string().url(),
    }),
  ),
  expiresAt: z.string().datetime({ offset: true }),
});

export const uploadCompletionSchema = z.object({
  assetId: z.string().min(1),
  fileId: z.string().min(1),
  jobId: z.string().min(1),
  status: z.literal('queued'),
});

/** API 与 Worker 共享同一队列负载，防止异步边界发生静默字段漂移。 */
export const analyzeAssetJobDataSchema = z.object({
  assetId: z.string().min(1),
  fileId: z.string().min(1),
  objectKey: z.string().min(1),
  expectedSha256: z.string().regex(/^[a-f\d]{64}$/i),
});

export type CreateUploadInput = z.infer<typeof createUploadInputSchema>;
export type CreateUploadRequest = z.input<typeof createUploadInputSchema>;
export type CompleteUploadInput = z.infer<typeof completeUploadInputSchema>;
export type ListAssetsQuery = z.infer<typeof listAssetsQuerySchema>;
export type UpdateAssetInput = z.infer<typeof updateAssetInputSchema>;
export type Asset = z.infer<typeof assetSchema>;
export type AssetDetail = z.infer<typeof assetDetailSchema>;
export type AssetListResponse = z.infer<typeof assetListResponseSchema>;
export type UploadSession = z.infer<typeof uploadSessionSchema>;
export type UploadCompletion = z.infer<typeof uploadCompletionSchema>;
export type AnalyzeAssetJobData = z.infer<typeof analyzeAssetJobDataSchema>;
