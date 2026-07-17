import { describe, expect, it } from 'vitest';
import {
  collectAssetReferences,
  createDefaultMaterialComponent,
  createDefaultSceneDocument,
  sceneDocumentSchema,
} from '../src/index';

describe('SceneDocument', () => {
  it('创建可被协议校验的空场景', () => {
    const document = createDefaultSceneDocument(
      'project-1',
      'scene-1',
      '场景一',
    );

    expect(sceneDocumentSchema.parse(document)).toEqual(document);
    expect(document.schemaVersion).toBe(1);
    expect(document.revision).toBe(0);
    // 这些是源站 initRender/initScene/initPlaneGround 的真实初始值，不是面板临时占位值。
    expect(document.settings).toEqual({
      toneMapping: 'neutral',
      shadowMapType: 'pcf',
      exposure: 1.2,
      backgroundType: 'color',
      background: '#3b3b3b',
      backgroundAssetId: null,
      backgroundBlurriness: 0,
      backgroundIntensity: 5,
      environmentEnabled: true,
      environmentAssetId: null,
      fogType: 'exponential',
      fogColor: '#3b3b3b',
      fogNear: 1,
      fogFar: 200,
      fogDensity: 0.01,
      groundType: 'grid',
      gridVisible: true,
      weatherType: 'none',
      weatherCount: 2_000,
      weatherSpeed: 0.4,
      weatherOpacity: 0.6,
      weatherSize: 0.5,
      weatherArea: 100,
      weatherHeight: 50,
    });
  });

  it('为已有 schemaVersion 1 文档补齐源站项目配置', () => {
    const document = createDefaultSceneDocument(
      'project-1',
      'scene-1',
      '旧场景',
    );
    const parsed = sceneDocumentSchema.parse({
      ...document,
      settings: {
        background: '#020617',
        environmentAssetId: 'environment-legacy',
        exposure: 1.6,
        gridVisible: false,
      },
    });

    expect(parsed.settings).toEqual({
      toneMapping: 'neutral',
      shadowMapType: 'pcf',
      exposure: 1.6,
      backgroundType: 'color',
      background: '#020617',
      backgroundAssetId: null,
      backgroundBlurriness: 0,
      backgroundIntensity: 5,
      environmentEnabled: true,
      environmentAssetId: 'environment-legacy',
      fogType: 'exponential',
      fogColor: '#3b3b3b',
      fogNear: 1,
      fogFar: 200,
      fogDensity: 0.01,
      groundType: 'grid',
      gridVisible: false,
      weatherType: 'none',
      weatherCount: 2_000,
      weatherSpeed: 0.4,
      weatherOpacity: 0.6,
      weatherSize: 0.5,
      weatherArea: 100,
      weatherHeight: 50,
    });
  });

  it('拒绝父节点不存在的场景树', () => {
    const document = createDefaultSceneDocument(
      'project-1',
      'scene-1',
      '场景一',
    );
    document.nodes.child = {
      id: 'child',
      parentId: 'missing',
      childIds: [],
      name: '错误节点',
      enabled: true,
      locked: false,
      transform: {
        position: [0, 0, 0],
        rotation: [0, 0, 0],
        scale: [1, 1, 1],
      },
      components: [],
      businessData: {},
    };

    expect(() => sceneDocumentSchema.parse(document)).toThrow('父节点不存在');
  });

  it('接受声明式条件树与强类型交互动作', () => {
    const document = createDefaultSceneDocument(
      'project-1',
      'scene-1',
      '交互场景',
    );
    const node = {
      id: 'device',
      parentId: null,
      childIds: [],
      name: '设备',
      enabled: true,
      locked: false,
      transform: {
        position: [0, 0, 0],
        rotation: [0, 0, 0],
        scale: [1, 1, 1],
      },
      components: [],
      businessData: {},
    };

    const result = sceneDocumentSchema.safeParse({
      ...document,
      rootNodeIds: [node.id],
      nodes: { [node.id]: node },
      interactions: [
        {
          id: 'interaction-1',
          name: '单击显示设备',
          enabled: true,
          sourceNodeId: node.id,
          trigger: { type: 'click' },
          conditions: {
            logic: 'all',
            conditions: [
              {
                left: { source: 'variable', key: 'enabled' },
                operator: 'eq',
                right: { source: 'literal', value: true },
              },
            ],
          },
          execution: 'sequential',
          actions: [
            {
              type: 'set-visibility',
              nodeId: node.id,
              visible: true,
            },
          ],
        },
      ],
    });

    expect(result.success).toBe(true);
  });

  it('拒绝任意脚本动作和悬空运行时引用', () => {
    const document = createDefaultSceneDocument(
      'project-1',
      'scene-1',
      '非法交互场景',
    );
    const baseInteraction = {
      id: 'interaction-1',
      name: '非法动作',
      enabled: true,
      sourceNodeId: 'missing-node',
      trigger: { type: 'click' },
      conditions: { logic: 'all', conditions: [] },
      execution: 'sequential',
    };

    expect(
      sceneDocumentSchema.safeParse({
        ...document,
        interactions: [
          {
            ...baseInteraction,
            actions: [{ type: 'eval', code: 'globalThis.compromised = true' }],
          },
        ],
      }).success,
    ).toBe(false);
    expect(
      sceneDocumentSchema.safeParse({
        ...document,
        interactions: [
          {
            ...baseInteraction,
            actions: [
              {
                type: 'set-visibility',
                nodeId: 'missing-node',
                visible: true,
              },
            ],
          },
        ],
      }).success,
    ).toBe(false);
  });

  it('接受完整 PBR 材质并从真实贴图绑定收集资源引用', () => {
    const document = createDefaultSceneDocument(
      'project-1',
      'scene-1',
      '材质场景',
    );
    const material = createDefaultMaterialComponent();
    material.materialType = 'physical';
    material.clearcoat = 0.8;
    material.textures.baseColor = {
      assetId: 'texture-color',
      offset: [0, 0],
      repeat: [2, 2],
      rotation: 0,
      wrapS: 'repeat',
      wrapT: 'repeat',
    };
    material.textures.normal = {
      ...material.textures.baseColor,
      assetId: 'texture-normal',
    };
    document.nodes.device = {
      id: 'device',
      parentId: null,
      childIds: [],
      name: '设备',
      enabled: true,
      locked: false,
      transform: {
        position: [0, 0, 0],
        rotation: [0, 0, 0],
        scale: [1, 1, 1],
      },
      components: [{ kind: 'model', assetId: 'model-1' }, material],
      businessData: {},
    };
    document.rootNodeIds = ['device'];
    document.settings.backgroundAssetId = 'background-1';
    document.settings.environmentAssetId = 'environment-1';

    expect(sceneDocumentSchema.safeParse(document).success).toBe(true);
    expect(collectAssetReferences(document)).toEqual([
      { assetId: 'background-1', nodeIds: [] },
      { assetId: 'environment-1', nodeIds: [] },
      { assetId: 'model-1', nodeIds: ['device'] },
      { assetId: 'texture-color', nodeIds: ['device'] },
      { assetId: 'texture-normal', nodeIds: ['device'] },
    ]);
  });

  it('拒绝越界材质参数和为零的 UV 重复值', () => {
    const document = createDefaultSceneDocument(
      'project-1',
      'scene-1',
      '非法材质场景',
    );
    const material = createDefaultMaterialComponent();
    material.opacity = 1.2;
    material.textures.baseColor = {
      assetId: 'texture-color',
      offset: [0, 0],
      repeat: [0, 1],
      rotation: 0,
      wrapS: 'repeat',
      wrapT: 'repeat',
    };
    document.nodes.device = {
      id: 'device',
      parentId: null,
      childIds: [],
      name: '设备',
      enabled: true,
      locked: false,
      transform: {
        position: [0, 0, 0],
        rotation: [0, 0, 0],
        scale: [1, 1, 1],
      },
      components: [material],
      businessData: {},
    };
    document.rootNodeIds = ['device'];

    expect(sceneDocumentSchema.safeParse(document).success).toBe(false);
  });
});
