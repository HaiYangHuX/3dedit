import type { Asset } from '@digital-twin/api-contracts';
import {
  createDefaultMaterialComponent,
  type SceneNode,
  type Transform,
} from '@digital-twin/scene-schema';
import { createUuid } from '../utils/createUuid';

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

const sourceInstanceSuffix = /_\d{4}$/;
export const MODEL_INSTANCE_NAME_VERSION_KEY =
  '__editorModelInstanceNameVersion';

/** 复现源站 Re(name)：上传模型保留文件扩展名，并追加四位实例随机码。 */
export function formatModelInstanceName(
  name: string,
  format: Asset['format'],
  suffix: string,
): string {
  if (sourceInstanceSuffix.test(name)) return name;
  const extension = `.${format}`;
  const fileName = name.toLocaleLowerCase('en-US').endsWith(extension)
    ? name
    : `${name}${extension}`;
  return `${fileName}_${suffix}`;
}

export function createModelInstanceName(
  name: string,
  format: Asset['format'],
): string {
  const suffix = Math.floor(Math.random() * 10_000)
    .toString()
    .padStart(4, '0');
  return formatModelInstanceName(name, format, suffix);
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
    id: options.id ?? createUuid(),
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
  asset: Pick<Asset, 'id' | 'name' | 'format'>,
  position: Transform['position'] = [0, 0, 0],
): SceneNode {
  const node = createSceneNode(
    createModelInstanceName(asset.name, asset.format),
    [{ kind: 'model', assetId: asset.id }],
    { position },
  );
  node.businessData[MODEL_INSTANCE_NAME_VERSION_KEY] = 1;
  return node;
}

export function createGeometryNode(
  primitive: GeometryPrimitive,
  position: Transform['position'] = [0, 0, 0],
): SceneNode {
  return createSceneNode(
    geometryNames[primitive],
    [{ kind: 'geometry', primitive }, createDefaultMaterialComponent()],
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
