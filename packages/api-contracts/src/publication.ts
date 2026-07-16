import { sceneDocumentSchema } from '@digital-twin/scene-schema';
import { z } from 'zod';
import { assetFormatSchema } from './asset.js';

const identifierSchema = z.string().min(1);
const isoDateSchema = z.string().datetime({ offset: true });

export const publishSceneInputSchema = z.object({
  sceneId: identifierSchema,
});

export const publicationAssetEntrySchema = z.object({
  name: z.string().min(1),
  format: assetFormatSchema,
  mimeType: z.string().min(1),
  size: z.number().nonnegative(),
  objectKey: z.string().min(1),
  url: z.string().url(),
});

export const publicationManifestSchema = z
  .object({
    schemaVersion: z.literal(1),
    publicationId: identifierSchema,
    projectId: identifierSchema,
    sceneId: identifierSchema,
    // releaseId 是对象存储原子切换的内部键，不代表用户可管理的发布版本。
    releaseId: identifierSchema,
    contentHash: identifierSchema,
    document: sceneDocumentSchema,
    assets: z.record(identifierSchema, publicationAssetEntrySchema),
  })
  .superRefine((manifest, context) => {
    if (manifest.document.id !== manifest.sceneId) {
      context.addIssue({ code: 'custom', message: '发布场景 ID 与文档不一致' });
    }
    if (manifest.document.projectId !== manifest.projectId) {
      context.addIssue({ code: 'custom', message: '发布项目 ID 与文档不一致' });
    }
  });

export const publicationDetailSchema = z.object({
  id: identifierSchema,
  projectId: identifierSchema,
  sceneId: identifierSchema,
  status: z.literal('active'),
  contentHash: identifierSchema,
  publishedAt: isoDateSchema,
  runtimeUrl: z.string().url(),
  iframeCode: z.string().min(1),
});

export type PublishSceneInput = z.infer<typeof publishSceneInputSchema>;
export type PublicationAssetEntry = z.infer<typeof publicationAssetEntrySchema>;
export type PublicationManifest = z.infer<typeof publicationManifestSchema>;
export type PublicationDetail = z.infer<typeof publicationDetailSchema>;
