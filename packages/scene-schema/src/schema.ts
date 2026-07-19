import { z } from 'zod';
import {
  cameraRoamingListSchema,
  createDefaultSceneCamera,
  sceneCameraSchema,
} from './camera.js';
import { materialComponentSchema } from './material.js';

const identifierSchema = z.string().min(1);
const vector3Schema = z.tuple([z.number(), z.number(), z.number()]);
const easingSchema = z.enum(['linear', 'ease-in', 'ease-out', 'ease-in-out']);

export const transformSchema = z.object({
  position: vector3Schema,
  rotation: vector3Schema,
  scale: vector3Schema,
});

const componentSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('model'),
    assetId: identifierSchema,
    /** 用户从场景树移除的 Mesh 路径；按模型层级索引保存，避免 UUID 重载后失效。 */
    excludedPartPaths: z.array(z.string().min(1)).optional(),
  }),
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
  materialComponentSchema,
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
  id: identifierSchema,
  parentId: identifierSchema.nullable(),
  childIds: z.array(identifierSchema),
  name: z.string().min(1),
  enabled: z.boolean(),
  locked: z.boolean(),
  transform: transformSchema,
  components: z.array(componentSchema),
  businessData: z.record(z.string(), z.json()),
});

export const triggerDefinitionSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('scene-load') }),
  z.object({ type: z.literal('click') }),
  z.object({ type: z.literal('double-click') }),
  z.object({ type: z.literal('pointer-enter') }),
  z.object({ type: z.literal('pointer-leave') }),
  z.object({
    type: z.literal('timer'),
    delayMs: z.number().int().nonnegative(),
    intervalMs: z.number().int().positive().optional(),
  }),
  z.object({
    type: z.literal('websocket'),
    dataSourceId: identifierSchema,
    taskCode: identifierSchema.optional(),
  }),
  z.object({
    type: z.literal('variable-change'),
    key: identifierSchema,
  }),
  z.object({
    type: z.literal('animation-end'),
    nodeId: identifierSchema,
    clip: z.string().min(1).optional(),
  }),
  z.object({
    type: z.enum(['region-enter', 'region-leave']),
    regionNodeId: identifierSchema,
  }),
]);

export const runtimeOperandSchema = z.discriminatedUnion('source', [
  z.object({ source: z.literal('literal'), value: z.json() }),
  z.object({ source: z.literal('variable'), key: identifierSchema }),
  z.object({
    source: z.literal('message'),
    path: z
      .string()
      .regex(/^[A-Za-z0-9_$-]+(?:\.[A-Za-z0-9_$-]+)*$/)
      .optional(),
  }),
  z.object({ source: z.literal('node-visible'), nodeId: identifierSchema }),
]);

const atomicConditionSchema = z
  .object({
    left: runtimeOperandSchema,
    operator: z.enum([
      'eq',
      'ne',
      'gt',
      'gte',
      'lt',
      'lte',
      'contains',
      'truthy',
      'falsy',
    ]),
    right: runtimeOperandSchema.optional(),
  })
  .superRefine((condition, context) => {
    if (
      condition.operator !== 'truthy' &&
      condition.operator !== 'falsy' &&
      !condition.right
    ) {
      context.addIssue({
        code: 'custom',
        message: `条件 ${condition.operator} 缺少右操作数`,
      });
    }
  });

export type RuntimeOperand = z.infer<typeof runtimeOperandSchema>;
export type AtomicCondition = z.infer<typeof atomicConditionSchema>;
export type ConditionDefinition = AtomicCondition | ConditionGroup;
export interface ConditionGroup {
  logic: 'all' | 'any';
  conditions: ConditionDefinition[];
}

/** 条件组允许 AND/OR 任意嵌套，但每个叶子仍是受控声明式比较。 */
const conditionDefinitionSchema: z.ZodType<ConditionDefinition> = z.lazy(() =>
  z.union([atomicConditionSchema, conditionGroupSchema]),
);

export const conditionGroupSchema: z.ZodType<ConditionGroup> = z.object({
  logic: z.enum(['all', 'any']),
  conditions: z.array(conditionDefinitionSchema),
});

const transitionSchema = z.object({
  durationMs: z.number().int().nonnegative().optional(),
  easing: easingSchema.optional(),
});

const partialTransformSchema = z
  .object({
    position: vector3Schema.optional(),
    rotation: vector3Schema.optional(),
    scale: vector3Schema.optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: '变换动作至少需要 position、rotation 或 scale',
  });

export const actionDefinitionSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('set-visibility'),
    nodeId: identifierSchema,
    visible: z.boolean(),
  }),
  z.object({
    type: z.literal('toggle-visibility'),
    nodeId: identifierSchema,
  }),
  z
    .object({
      type: z.literal('set-transform'),
      nodeId: identifierSchema,
      transform: partialTransformSchema,
    })
    .extend(transitionSchema.shape),
  z.object({
    type: z.literal('set-color'),
    nodeId: identifierSchema,
    color: z.string().min(1),
  }),
  z.object({
    type: z.literal('set-highlight'),
    nodeId: identifierSchema,
    highlighted: z.boolean(),
  }),
  z.object({
    type: z.literal('control-animation'),
    nodeId: identifierSchema,
    command: z.enum(['play', 'pause', 'toggle', 'stop']),
    clip: z.string().min(1).optional(),
    speed: z.number().positive().optional(),
    loop: z.boolean().optional(),
  }),
  z.object({
    type: z.literal('control-video'),
    nodeId: identifierSchema,
    command: z.enum(['play', 'pause', 'toggle', 'seek']),
    currentTime: z.number().nonnegative().optional(),
  }),
  z.object({
    type: z.literal('set-text'),
    nodeId: identifierSchema,
    text: z.string(),
  }),
  z.object({
    type: z.literal('set-chart-data'),
    nodeId: identifierSchema,
    data: z.json(),
  }),
  z
    .object({ type: z.literal('focus-node'), nodeId: identifierSchema })
    .extend(transitionSchema.shape),
  z.object({
    type: z.literal('switch-scene'),
    sceneId: identifierSchema,
  }),
  z.object({
    type: z.literal('open-link'),
    url: z.string().url(),
    target: z.enum(['_self', '_blank']).optional(),
  }),
  z.object({
    type: z.literal('open-popup'),
    name: identifierSchema,
    payload: z.json().optional(),
  }),
  z.object({
    type: z.literal('set-variable'),
    key: identifierSchema,
    value: z.json(),
  }),
  z.object({
    type: z.literal('delay'),
    durationMs: z.number().int().nonnegative(),
  }),
]);

export const interactionDefinitionSchema = z.object({
  id: identifierSchema,
  name: z.string().min(1),
  enabled: z.boolean(),
  sourceNodeId: identifierSchema,
  trigger: triggerDefinitionSchema,
  conditions: conditionGroupSchema,
  execution: z.enum(['sequential', 'parallel']),
  actions: z.array(actionDefinitionSchema).min(1),
});

export const dataSourceDefinitionSchema = z.object({
  id: identifierSchema,
  name: z.string().min(1),
  type: z.literal('websocket'),
  url: z.string().url(),
  enabled: z.boolean(),
  autoConnect: z.boolean().optional(),
  heartbeatMs: z.number().int().positive(),
  heartbeatPayload: z.json().optional(),
  reconnectLimit: z.number().int().nonnegative(),
  reconnectBaseDelayMs: z.number().int().positive().optional(),
});

export const socketTaskTypeSchema = z.enum([
  'ModelPosition',
  'ModelRotation',
  'ModelScale',
  'ModelVisible',
  'ModelColor',
  'TextUpdate',
  'ChartUpdate',
  'VideoControl',
  'AnimationControl',
  'CameraMove',
]);

export const socketTaskDefinitionSchema = z.object({
  id: identifierSchema,
  dataSourceId: identifierSchema,
  taskCode: identifierSchema,
  taskType: socketTaskTypeSchema,
  targetNodeId: identifierSchema,
  taskTime: z.number().int().nonnegative(),
  taskData: z.record(z.string(), z.json()),
});

/**
 * 项目级渲染配置与 数字孪生 r183 的实际初始化参数保持一致。
 * 每个新字段都自带默认值，使旧 schemaVersion 1 文档无需升版即可解析。
 */
export const sceneSettingsSchema = z.object({
  toneMapping: z
    .enum([
      'custom',
      'none',
      'linear',
      'reinhard',
      'cineon',
      'aces-filmic',
      'agx',
      'neutral',
    ])
    .default('neutral'),
  shadowMapType: z.enum(['basic', 'pcf', 'pcf-soft', 'vsm']).default('pcf'),
  exposure: z.number().min(0).max(5).default(1.2),
  backgroundType: z.enum(['none', 'color', 'texture']).default('color'),
  background: z.string().default('#3b3b3b'),
  backgroundAssetId: identifierSchema.nullable().default(null),
  backgroundBlurriness: z.number().min(0).max(1).default(0),
  backgroundIntensity: z.number().min(0).max(6).default(5),
  environmentEnabled: z.boolean().default(true),
  environmentAssetId: identifierSchema.nullable().default(null),
  fogType: z.enum(['none', 'linear', 'exponential']).default('exponential'),
  fogColor: z.string().default('#3b3b3b'),
  fogNear: z.number().min(0).max(1_000).default(1),
  fogFar: z.number().min(0).max(1_000).default(200),
  fogDensity: z.number().min(0).max(5).default(0.01),
  groundType: z
    .enum([
      'none',
      'grid',
      'lawn',
      'rock',
      'stone',
      'floor',
      'tile-1',
      'tile-2',
      'brick',
    ])
    .default('grid'),
  // 保留旧字段作为视口工具栏兼容镜像，真实地面类型由 groundType 决定。
  gridVisible: z.boolean().default(true),
  weatherType: z.enum(['none', 'rain', 'snow']).default('none'),
  weatherCount: z.number().int().min(0).max(100_000).default(2_000),
  weatherSpeed: z.number().min(0.1).max(1.5).default(0.4),
  weatherOpacity: z.number().min(0).max(1).default(0.6),
  weatherSize: z.number().min(0.1).max(2).default(0.5),
  weatherArea: z.number().min(0).max(500).default(100),
  weatherHeight: z.number().min(0).max(300).default(50),
});

function addDuplicateIssues(
  values: Array<{ id: string }>,
  label: string,
  context: z.RefinementCtx,
): void {
  const seen = new Set<string>();
  for (const value of values) {
    if (seen.has(value.id)) {
      context.addIssue({
        code: 'custom',
        message: `${label} ID 重复: ${value.id}`,
      });
    }
    seen.add(value.id);
  }
}

function collectConditionNodeIds(
  definition: ConditionDefinition,
  result: Set<string>,
): void {
  if ('logic' in definition) {
    for (const child of definition.conditions) {
      collectConditionNodeIds(child, result);
    }
    return;
  }
  if (definition.left.source === 'node-visible') {
    result.add(definition.left.nodeId);
  }
  if (definition.right?.source === 'node-visible') {
    result.add(definition.right.nodeId);
  }
}

export const sceneDocumentSchema = z
  .object({
    schemaVersion: z.literal(1),
    id: identifierSchema,
    projectId: identifierSchema,
    name: z.string().min(1),
    revision: z.number().int().nonnegative(),
    rootNodeIds: z.array(identifierSchema),
    nodes: z.record(z.string(), sceneNodeSchema),
    settings: sceneSettingsSchema,
    camera: sceneCameraSchema.default(() => createDefaultSceneCamera()),
    cameraRoamingList: cameraRoamingListSchema.default(() => []),
    interactions: z.array(interactionDefinitionSchema),
    dataSources: z.array(dataSourceDefinitionSchema),
    socketTasks: z.array(socketTaskDefinitionSchema),
    assetReferences: z.array(
      z.object({
        assetId: identifierSchema,
        nodeIds: z.array(identifierSchema),
      }),
    ),
  })
  .superRefine((document, context) => {
    const nodeIds = new Set(Object.keys(document.nodes));
    for (const [key, node] of Object.entries(document.nodes)) {
      if (key !== node.id) {
        context.addIssue({
          code: 'custom',
          message: `节点键与 id 不一致: ${key}`,
        });
      }
      if (node.parentId && !nodeIds.has(node.parentId)) {
        context.addIssue({
          code: 'custom',
          message: `父节点不存在: ${node.parentId}`,
        });
      }
      for (const childId of node.childIds) {
        if (!nodeIds.has(childId)) {
          context.addIssue({
            code: 'custom',
            message: `子节点不存在: ${childId}`,
          });
        }
      }
    }
    for (const id of document.rootNodeIds) {
      if (!document.nodes[id] || document.nodes[id].parentId !== null) {
        context.addIssue({ code: 'custom', message: `根节点无效: ${id}` });
      }
    }

    addDuplicateIssues(document.interactions, '交互', context);
    addDuplicateIssues(document.dataSources, '数据源', context);
    addDuplicateIssues(document.socketTasks, 'Socket 任务', context);
    const taskCodes = new Set<string>();
    for (const task of document.socketTasks) {
      if (taskCodes.has(task.taskCode)) {
        context.addIssue({
          code: 'custom',
          message: `Socket taskCode 重复: ${task.taskCode}`,
        });
      }
      taskCodes.add(task.taskCode);
    }

    const dataSourceIds = new Set(document.dataSources.map(({ id }) => id));
    for (const interaction of document.interactions) {
      const referencedNodes = new Set<string>([interaction.sourceNodeId]);
      collectConditionNodeIds(interaction.conditions, referencedNodes);
      if (
        interaction.trigger.type === 'animation-end' ||
        interaction.trigger.type === 'region-enter' ||
        interaction.trigger.type === 'region-leave'
      ) {
        referencedNodes.add(
          interaction.trigger.type === 'animation-end'
            ? interaction.trigger.nodeId
            : interaction.trigger.regionNodeId,
        );
      }
      if (
        interaction.trigger.type === 'websocket' &&
        !dataSourceIds.has(interaction.trigger.dataSourceId)
      ) {
        context.addIssue({
          code: 'custom',
          message: `交互数据源不存在: ${interaction.trigger.dataSourceId}`,
        });
      }
      for (const action of interaction.actions) {
        if ('nodeId' in action) referencedNodes.add(action.nodeId);
      }
      for (const nodeId of referencedNodes) {
        if (!nodeIds.has(nodeId)) {
          context.addIssue({
            code: 'custom',
            message: `交互引用节点不存在: ${nodeId}`,
          });
        }
      }
    }
    for (const task of document.socketTasks) {
      if (!dataSourceIds.has(task.dataSourceId)) {
        context.addIssue({
          code: 'custom',
          message: `Socket 任务数据源不存在: ${task.dataSourceId}`,
        });
      }
      if (!nodeIds.has(task.targetNodeId)) {
        context.addIssue({
          code: 'custom',
          message: `Socket 任务节点不存在: ${task.targetNodeId}`,
        });
      }
    }
  });

export type TriggerDefinition = z.infer<typeof triggerDefinitionSchema>;
export type ActionDefinition = z.infer<typeof actionDefinitionSchema>;
export type InteractionDefinition = z.infer<typeof interactionDefinitionSchema>;
export type DataSourceDefinition = z.infer<typeof dataSourceDefinitionSchema>;
export type SocketTaskDefinition = z.infer<typeof socketTaskDefinitionSchema>;
export type SocketTaskType = z.infer<typeof socketTaskTypeSchema>;
export type SceneSettings = z.infer<typeof sceneSettingsSchema>;
export type SceneDocument = z.infer<typeof sceneDocumentSchema>;
export type SceneNode = z.infer<typeof sceneNodeSchema>;
export type Transform = z.infer<typeof transformSchema>;
