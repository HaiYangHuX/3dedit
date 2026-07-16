import { z } from 'zod';

export const materialTypeSchema = z.enum([
  'standard',
  'physical',
  'phong',
  'basic',
]);
export const materialSideSchema = z.enum(['front', 'back', 'double']);
export const textureWrapSchema = z.enum(['repeat', 'clamp', 'mirror']);
export const materialTextureSlotSchema = z.enum([
  'baseColor',
  'normal',
  'roughness',
  'metalness',
  'ao',
  'emissive',
]);

const vector2Schema = z.tuple([z.number(), z.number()]);
const repeatSchema = vector2Schema.refine(
  ([x, y]) => x !== 0 && y !== 0,
  'UV repeat 的两个轴都不能为 0',
);

export const materialTextureBindingSchema = z.object({
  assetId: z.string().min(1),
  offset: vector2Schema,
  repeat: repeatSchema,
  rotation: z.number(),
  wrapS: textureWrapSchema,
  wrapT: textureWrapSchema,
});

const nullableTextureBinding = materialTextureBindingSchema.nullable();

/**
 * 节点级材质覆盖协议只保存业务参数和素材 ID，不保存 Three.js UUID 或运行时对象。
 * 所有材质类型共用完整字段集，使用户切换类型后仍能恢复之前调好的参数。
 */
export const materialComponentSchema = z.object({
  kind: z.literal('material'),
  materialType: materialTypeSchema,
  color: z.string().min(1),
  transparent: z.boolean(),
  opacity: z.number().min(0).max(1),
  wireframe: z.boolean(),
  side: materialSideSchema,
  depthTest: z.boolean(),
  depthWrite: z.boolean(),
  roughness: z.number().min(0).max(1),
  metalness: z.number().min(0).max(1),
  emissive: z.string().min(1),
  emissiveIntensity: z.number().nonnegative(),
  envMapIntensity: z.number().nonnegative(),
  clearcoat: z.number().min(0).max(1),
  clearcoatRoughness: z.number().min(0).max(1),
  reflectivity: z.number().min(0).max(1),
  specular: z.string().min(1),
  shininess: z.number().nonnegative(),
  normalScale: vector2Schema,
  aoMapIntensity: z.number().nonnegative(),
  castShadow: z.boolean(),
  receiveShadow: z.boolean(),
  textures: z.object({
    baseColor: nullableTextureBinding,
    normal: nullableTextureBinding,
    roughness: nullableTextureBinding,
    metalness: nullableTextureBinding,
    ao: nullableTextureBinding,
    emissive: nullableTextureBinding,
  }),
});

export type MaterialType = z.infer<typeof materialTypeSchema>;
export type MaterialSide = z.infer<typeof materialSideSchema>;
export type TextureWrap = z.infer<typeof textureWrapSchema>;
export type MaterialTextureSlot = z.infer<typeof materialTextureSlotSchema>;
export type MaterialTextureBinding = z.infer<
  typeof materialTextureBindingSchema
>;
export type MaterialComponent = z.infer<typeof materialComponentSchema>;

/** 创建可以直接交给协议校验和编辑命令的完整材质默认值。 */
export function createDefaultMaterialComponent(): MaterialComponent {
  return {
    kind: 'material',
    materialType: 'standard',
    color: '#94a3b8',
    transparent: false,
    opacity: 1,
    wireframe: false,
    side: 'front',
    depthTest: true,
    depthWrite: true,
    roughness: 0.72,
    metalness: 0.08,
    emissive: '#000000',
    emissiveIntensity: 1,
    envMapIntensity: 1,
    clearcoat: 0,
    clearcoatRoughness: 0,
    reflectivity: 0.5,
    specular: '#111111',
    shininess: 30,
    normalScale: [1, 1],
    aoMapIntensity: 1,
    castShadow: false,
    receiveShadow: false,
    textures: {
      baseColor: null,
      normal: null,
      roughness: null,
      metalness: null,
      ao: null,
      emissive: null,
    },
  };
}
