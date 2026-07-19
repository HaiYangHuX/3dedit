import { z } from 'zod';
import { sceneSummarySchema } from './scene.js';

const projectNameSchema = z.string().trim().min(1).max(80);
const projectDescriptionSchema = z.string().trim().max(500);
const isoDateSchema = z.string().datetime({ offset: true });
export const projectStatusSchema = z.enum(['draft', 'active', 'archived']);

export const listProjectsQuerySchema = z.object({
  keyword: z.string().trim().max(80).optional().default(''),
});

export const createProjectInputSchema = z.object({
  name: projectNameSchema,
  description: projectDescriptionSchema.optional().default(''),
  /** 创建和编辑项目使用同一套封面字段；未提供时由页面显示默认占位图。 */
  coverKey: z.string().trim().min(1).nullable().optional(),
  // 新增字段保持 optional 输出，旧客户端仍可只提交 name/description；服务端负责填充产品默认值。
  code: z.string().trim().max(80).optional(),
  status: projectStatusSchema.optional(),
  tags: z.array(z.string().trim().min(1).max(40)).max(20).optional(),
  ownerName: z.string().trim().max(80).optional(),
  industry: z.string().trim().max(80).optional(),
  location: z.string().trim().max(120).optional(),
  notes: z.string().trim().max(1_000).optional(),
});

export const updateProjectInputSchema = z
  .object({
    name: projectNameSchema.optional(),
    description: projectDescriptionSchema.optional(),
    coverKey: z.string().trim().min(1).nullable().optional(),
    code: z.string().trim().max(80).optional(),
    status: projectStatusSchema.optional(),
    tags: z.array(z.string().trim().min(1).max(40)).max(20).optional(),
    ownerName: z.string().trim().max(80).optional(),
    industry: z.string().trim().max(80).optional(),
    location: z.string().trim().max(120).optional(),
    notes: z.string().trim().max(1_000).optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: '至少需要修改一个项目字段',
  });

export const copyProjectInputSchema = z.object({
  name: projectNameSchema.optional(),
});

export const projectSummarySchema = z.object({
  id: z.string().min(1),
  name: projectNameSchema,
  description: projectDescriptionSchema,
  // 允许旧项目 DTO 缺失新增字段；服务端新接口会填充默认值。
  code: z.string().optional(),
  status: projectStatusSchema.optional(),
  tags: z.array(z.string()).optional(),
  ownerName: z.string().optional(),
  industry: z.string().optional(),
  location: z.string().optional(),
  notes: z.string().optional(),
  coverKey: z.string().nullable(),
  sceneCount: z.number().int().nonnegative(),
  assetCount: z.number().int().nonnegative().optional(),
  lastPublishedAt: isoDateSchema.nullable().optional(),
  createdAt: isoDateSchema,
  updatedAt: isoDateSchema,
});

export const projectDetailSchema = projectSummarySchema.extend({
  scenes: z.array(sceneSummarySchema),
  publicationStatus: z.string().nullable(),
});

export type ListProjectsQuery = z.infer<typeof listProjectsQuerySchema>;
export type ProjectStatus = z.infer<typeof projectStatusSchema>;
export type CreateProjectInput = z.infer<typeof createProjectInputSchema>;
export type UpdateProjectInput = z.infer<typeof updateProjectInputSchema>;
export type CopyProjectInput = z.infer<typeof copyProjectInputSchema>;
export type ProjectSummary = z.infer<typeof projectSummarySchema>;
export type ProjectDetail = z.infer<typeof projectDetailSchema>;
