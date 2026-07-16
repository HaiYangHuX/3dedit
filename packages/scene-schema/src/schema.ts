import { z } from 'zod';

const vector3Schema = z.tuple([z.number(), z.number(), z.number()]);

export const transformSchema = z.object({
  position: vector3Schema,
  rotation: vector3Schema,
  scale: vector3Schema,
});

const componentSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('model'), assetId: z.string().min(1) }),
  z.object({
    kind: z.literal('geometry'),
    primitive: z.enum(['box', 'sphere', 'plane', 'cylinder']),
  }),
  z.object({
    kind: z.literal('light'),
    lightType: z.enum([
      'ambient',
      'directional',
      'hemisphere',
      'point',
      'spot',
    ]),
    color: z.string(),
    intensity: z.number().nonnegative(),
    castShadow: z.boolean(),
  }),
  z.object({
    kind: z.enum([
      'camera',
      'text',
      'annotation',
      'image',
      'video',
      'chart',
      'shader',
      'effect',
    ]),
    data: z.record(z.string(), z.json()),
  }),
]);

export const sceneNodeSchema = z.object({
  id: z.string().min(1),
  parentId: z.string().min(1).nullable(),
  childIds: z.array(z.string().min(1)),
  name: z.string().min(1),
  enabled: z.boolean(),
  locked: z.boolean(),
  transform: transformSchema,
  components: z.array(componentSchema),
  businessData: z.record(z.string(), z.json()),
});

const interactionSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  enabled: z.boolean(),
  sourceNodeId: z.string().min(1),
  trigger: z.object({
    type: z.string().min(1),
    config: z.record(z.string(), z.json()),
  }),
  conditions: z.array(z.record(z.string(), z.json())),
  execution: z.enum(['sequential', 'parallel']),
  actions: z.array(z.record(z.string(), z.json())),
});

const dataSourceSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  type: z.literal('websocket'),
  url: z.string().url(),
  enabled: z.boolean(),
  heartbeatMs: z.number().int().positive(),
  reconnectLimit: z.number().int().nonnegative(),
});

const socketTaskSchema = z.object({
  id: z.string().min(1),
  dataSourceId: z.string().min(1),
  taskCode: z.string().min(1),
  taskType: z.string().min(1),
  targetNodeId: z.string().min(1),
  taskTime: z.number().nonnegative(),
  taskData: z.record(z.string(), z.json()),
});

export const sceneDocumentSchema = z
  .object({
    schemaVersion: z.literal(1),
    id: z.string().min(1),
    projectId: z.string().min(1),
    name: z.string().min(1),
    revision: z.number().int().nonnegative(),
    rootNodeIds: z.array(z.string().min(1)),
    nodes: z.record(z.string(), sceneNodeSchema),
    settings: z.object({
      background: z.string(),
      environmentAssetId: z.string().nullable(),
      exposure: z.number().positive(),
      gridVisible: z.boolean(),
    }),
    interactions: z.array(interactionSchema),
    dataSources: z.array(dataSourceSchema),
    socketTasks: z.array(socketTaskSchema),
    assetReferences: z.array(
      z.object({
        assetId: z.string().min(1),
        nodeIds: z.array(z.string().min(1)),
      }),
    ),
  })
  .superRefine((document, context) => {
    for (const [key, node] of Object.entries(document.nodes)) {
      if (key !== node.id) {
        context.addIssue({
          code: 'custom',
          message: `节点键与 id 不一致: ${key}`,
        });
      }
      if (node.parentId && !document.nodes[node.parentId]) {
        context.addIssue({
          code: 'custom',
          message: `父节点不存在: ${node.parentId}`,
        });
      }
    }
    for (const id of document.rootNodeIds) {
      if (!document.nodes[id] || document.nodes[id].parentId !== null) {
        context.addIssue({ code: 'custom', message: `根节点无效: ${id}` });
      }
    }
  });

export type SceneDocument = z.infer<typeof sceneDocumentSchema>;
export type SceneNode = z.infer<typeof sceneNodeSchema>;
export type Transform = z.infer<typeof transformSchema>;
