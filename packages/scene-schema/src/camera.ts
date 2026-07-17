import { z } from 'zod';

const finiteNumberSchema = z.number().refine(Number.isFinite, {
  message: '坐标必须是有限数',
});

export const cameraVector3Schema = z.tuple([
  finiteNumberSchema,
  finiteNumberSchema,
  finiteNumberSchema,
]);

const sceneCameraBaseSchema = z.object({
  type: z.literal('perspective'),
  name: z.string().min(1),
  position: cameraVector3Schema,
  rotation: cameraVector3Schema,
  scale: cameraVector3Schema,
  target: cameraVector3Schema,
  visible: z.boolean(),
  castShadow: z.boolean(),
  receiveShadow: z.boolean(),
  frustumCulled: z.boolean(),
  fov: finiteNumberSchema.positive().max(180),
  near: finiteNumberSchema.positive(),
  far: finiteNumberSchema.positive(),
});

export const sceneCameraSchema = sceneCameraBaseSchema.superRefine(
  (camera, context) => {
    if (camera.far <= camera.near) {
      context.addIssue({
        code: 'custom',
        path: ['far'],
        message: '相机 far 必须大于 near',
      });
    }
  },
);

export const cameraRoamingPathSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  pathPoints: z.array(cameraVector3Schema).min(2),
});

export const cameraRoamingListSchema = z
  .array(cameraRoamingPathSchema)
  .superRefine((paths, context) => {
    const ids = new Set<string>();
    for (let index = 0; index < paths.length; index += 1) {
      const path = paths[index]!;
      if (ids.has(path.id)) {
        context.addIssue({
          code: 'custom',
          path: [index, 'id'],
          message: `相机漫游路径 ID 重复: ${path.id}`,
        });
      }
      ids.add(path.id);
    }
  });

export type SceneCamera = z.infer<typeof sceneCameraSchema>;
export type CameraRoamingPath = z.infer<typeof cameraRoamingPathSchema>;

/** 源站 initCamera/resetCameraPosition 的稳定业务 DTO，不保存容器派生的 aspect。 */
export function createDefaultSceneCamera(): SceneCamera {
  return {
    type: 'perspective',
    name: 'Camera',
    position: [0.607, 3.347, 7.966],
    rotation: [-0.304, 0.048, 0.016],
    scale: [1, 1, 1],
    target: [0, 0.5, 0],
    visible: true,
    castShadow: false,
    receiveShadow: false,
    frustumCulled: true,
    fov: 45,
    near: 0.05,
    far: 20_000,
  };
}
