import { z } from 'zod';
import { sceneSummarySchema } from './scene.js';

const projectNameSchema = z.string().trim().min(1).max(80);
const projectDescriptionSchema = z.string().trim().max(500);
const isoDateSchema = z.string().datetime({ offset: true });

export const listProjectsQuerySchema = z.object({
  keyword: z.string().trim().max(80).optional().default(''),
});

export const createProjectInputSchema = z.object({
  name: projectNameSchema,
  description: projectDescriptionSchema.optional().default(''),
});

export const updateProjectInputSchema = z
  .object({
    name: projectNameSchema.optional(),
    description: projectDescriptionSchema.optional(),
    coverKey: z.string().trim().min(1).nullable().optional(),
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
  coverKey: z.string().nullable(),
  sceneCount: z.number().int().nonnegative(),
  createdAt: isoDateSchema,
  updatedAt: isoDateSchema,
});

export const projectDetailSchema = projectSummarySchema.extend({
  scenes: z.array(sceneSummarySchema),
  publicationStatus: z.string().nullable(),
});

export type ListProjectsQuery = z.infer<typeof listProjectsQuerySchema>;
export type CreateProjectInput = z.infer<typeof createProjectInputSchema>;
export type UpdateProjectInput = z.infer<typeof updateProjectInputSchema>;
export type CopyProjectInput = z.infer<typeof copyProjectInputSchema>;
export type ProjectSummary = z.infer<typeof projectSummarySchema>;
export type ProjectDetail = z.infer<typeof projectDetailSchema>;
