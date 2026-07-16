import type { Asset } from '@digital-twin/api-contracts';
import type { SceneNode, Transform } from '@digital-twin/scene-schema';

type SceneComponent = SceneNode['components'][number];
export type GeometryPrimitive = Extract<
  SceneComponent,
  { kind: 'geometry' }
>['primitive'];
export type SceneLightType = Extract<
  SceneComponent,
  { kind: 'light' }
>['lightType'];

export interface CreateSceneNodeOptions {
  id?: string;
  parentId?: string | null;
  position?: Transform['position'];
}

const geometryNames: Record<GeometryPrimitive, string> = {
  box: '立方体',
  sphere: '球体',
  plane: '平面',
  cylinder: '圆柱体',
};

const lightNames: Record<SceneLightType, string> = {
  ambient: '环境光',
  directional: '平行光',
  hemisphere: '半球光',
  point: '点光源',
  spot: '聚光灯',
};

/** 所有可视节点共用同一份初始不变量，避免各面板拼出不完整的 SceneNode。 */
export function createSceneNode(
  name: string,
  components: SceneComponent[],
  options: CreateSceneNodeOptions = {},
): SceneNode {
  return {
    id: options.id ?? globalThis.crypto.randomUUID(),
    parentId: options.parentId ?? null,
    childIds: [],
    name,
    enabled: true,
    locked: false,
    transform: {
      position: [...(options.position ?? [0, 0, 0])],
      rotation: [0, 0, 0],
      scale: [1, 1, 1],
    },
    components: structuredClone(components),
    businessData: {},
  };
}

export function createAssetNode(
  asset: Pick<Asset, 'id' | 'name'>,
  position: Transform['position'] = [0, 0, 0],
): SceneNode {
  return createSceneNode(asset.name, [{ kind: 'model', assetId: asset.id }], {
    position,
  });
}

export function createGeometryNode(
  primitive: GeometryPrimitive,
  position: Transform['position'] = [0, 0, 0],
): SceneNode {
  return createSceneNode(
    geometryNames[primitive],
    [{ kind: 'geometry', primitive }],
    { position },
  );
}

export function createLightNode(
  lightType: SceneLightType,
  position: Transform['position'] = [0, 0, 0],
): SceneNode {
  return createSceneNode(
    lightNames[lightType],
    [
      {
        kind: 'light',
        lightType,
        color: '#ffffff',
        intensity: lightType === 'ambient' ? 0.8 : 1,
        castShadow: ['directional', 'point', 'spot'].includes(lightType),
      },
    ],
    { position },
  );
}
