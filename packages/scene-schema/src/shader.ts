import { z } from 'zod';

/**
 * 原站生产包 ShaderMethod 枚举的完整快照。
 * 罗盘当前未出现在素材面板，但仍是可加载的历史方法，协议必须保留。
 */
export const SHADER_METHODS = [
  'CreateWarningShader',
  'CreateCompassShader',
  'CreateRadarShader',
  'CreateWallShader',
  'CreateApertureShader',
  'CreateFlickerWarning',
  'CreateWarningApertureShader',
  'CreateElectronicFence',
  'CreateWarningGuardrail',
  'CreateWarningGuardrailBreath',
  'CreateLogisticsConveyor',
  'CreateHologramBeam',
  'CreateHexTechPlatform',
] as const;

export const shaderMethodSchema = z.enum(SHADER_METHODS);

/** SceneDocument 只保存方法标识，GPU 对象和运行时 uniform 由 Three 引擎重建。 */
export const shaderComponentSchema = z.object({
  kind: z.literal('shader'),
  shaderMethod: shaderMethodSchema,
});

export type ShaderMethod = z.infer<typeof shaderMethodSchema>;
export type ShaderComponent = z.infer<typeof shaderComponentSchema>;
