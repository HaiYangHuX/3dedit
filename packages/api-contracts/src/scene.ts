import { sceneDocumentSchema } from '@digital-twin/scene-schema';
import { z } from 'zod';

const sceneNameSchema = z.string().trim().min(1).max(80);
const sceneDescriptionSchema = z.string().trim().max(1_000);
const identifierSchema = z.string().min(1);
const isoDateSchema = z.string().datetime({ offset: true });

/** 新建场景时名称由前端提供，服务端统一清理首尾空格。 */
export const createSceneInputSchema = z.object({
  name: sceneNameSchema,
  description: sceneDescriptionSchema.optional(),
  coverKey: z.string().trim().min(1).nullable().optional(),
});

export const updateSceneInputSchema = z
  .object({
    name: sceneNameSchema.optional(),
    description: sceneDescriptionSchema.optional(),
    coverKey: z.string().trim().min(1).nullable().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: '至少需要修改一个场景字段',
  });

export const copySceneInputSchema = z.object({
  name: sceneNameSchema.optional(),
});

export const reorderScenesInputSchema = z
  .object({
    sceneIds: z.array(identifierSchema).min(1),
  })
  .superRefine(({ sceneIds }, context) => {
    if (new Set(sceneIds).size !== sceneIds.length) {
      context.addIssue({ code: 'custom', message: '场景排序 ID 不能重复' });
    }
  });

/** baseRevision 与文档 revision 分开传递，便于服务端执行原子条件更新。 */
export const saveSceneInputSchema = z.object({
  baseRevision: z.number().int().nonnegative(),
  document: sceneDocumentSchema,
});

export const sceneSummarySchema = z.object({
  id: identifierSchema,
  projectId: identifierSchema,
  name: sceneNameSchema,
  // 旧导出的场景没有描述时按空字符串处理，新接口始终返回该字段。
  description: sceneDescriptionSchema.optional(),
  sortOrder: z.number().int().nonnegative(),
  revision: z.number().int().nonnegative(),
  contentHash: z.string(),
  coverKey: z.string().nullable(),
  createdAt: isoDateSchema,
  updatedAt: isoDateSchema,
});

export const sceneDetailSchema = sceneSummarySchema.extend({
  document: sceneDocumentSchema,
});

export type CreateSceneInput = z.infer<typeof createSceneInputSchema>;
export type UpdateSceneInput = z.infer<typeof updateSceneInputSchema>;
export type CopySceneInput = z.infer<typeof copySceneInputSchema>;
export type ReorderScenesInput = z.infer<typeof reorderScenesInputSchema>;
export type SaveSceneInput = z.infer<typeof saveSceneInputSchema>;
export type SceneSummary = z.infer<typeof sceneSummarySchema>;
export type SceneDetail = z.infer<typeof sceneDetailSchema>;
