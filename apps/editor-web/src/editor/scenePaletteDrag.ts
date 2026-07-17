import type { ModelAssetFormat } from '@digital-twin/three-engine';
import type { GeometryPrimitive, SceneLightType } from './createSceneNode';

export const SCENE_PALETTE_MIME =
  'application/x-digital-twin-scene-palette' as const;

export type ScenePaletteDragPayload =
  | {
      kind: 'asset';
      assetId: string;
      name: string;
      format: ModelAssetFormat;
    }
  | { kind: 'geometry'; primitive: GeometryPrimitive }
  | { kind: 'light'; lightType: SceneLightType };

export type ScenePaletteDropPayload = ScenePaletteDragPayload & {
  position: [number, number, number];
};

const modelFormats = new Set<ModelAssetFormat>([
  'glb',
  'gltf',
  'fbx',
  'obj',
  'stl',
  'usdz',
]);
const geometryPrimitives = new Set<GeometryPrimitive>([
  'box',
  'sphere',
  'plane',
  'cylinder',
]);
const lightTypes = new Set<SceneLightType>([
  'ambient',
  'directional',
  'hemisphere',
  'point',
  'spot',
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/**
 * 三类素材共用一个 MIME 和判别联合，避免沿用原站的全局“当前拖拽对象”状态。
 */
export function writeScenePaletteDrag(
  dataTransfer: DataTransfer,
  payload: ScenePaletteDragPayload,
): void {
  dataTransfer.effectAllowed = 'copy';
  dataTransfer.setData(SCENE_PALETTE_MIME, JSON.stringify(payload));
}

/** 只接受平台声明过的素材类型，外部文件和旧协议不会进入场景命令链。 */
export function readScenePaletteDrag(
  dataTransfer: DataTransfer | null | undefined,
): ScenePaletteDragPayload | undefined {
  const raw = dataTransfer?.getData(SCENE_PALETTE_MIME);
  if (!raw) return undefined;

  try {
    const value: unknown = JSON.parse(raw);
    if (!isRecord(value) || typeof value.kind !== 'string') return undefined;

    if (value.kind === 'asset') {
      if (
        typeof value.assetId !== 'string' ||
        value.assetId.length === 0 ||
        typeof value.name !== 'string' ||
        value.name.length === 0 ||
        typeof value.format !== 'string' ||
        !modelFormats.has(value.format as ModelAssetFormat)
      ) {
        return undefined;
      }
      return {
        kind: 'asset',
        assetId: value.assetId,
        name: value.name,
        format: value.format as ModelAssetFormat,
      };
    }

    if (value.kind === 'geometry') {
      if (
        typeof value.primitive !== 'string' ||
        !geometryPrimitives.has(value.primitive as GeometryPrimitive)
      ) {
        return undefined;
      }
      return {
        kind: 'geometry',
        primitive: value.primitive as GeometryPrimitive,
      };
    }

    if (value.kind === 'light') {
      if (
        typeof value.lightType !== 'string' ||
        !lightTypes.has(value.lightType as SceneLightType)
      ) {
        return undefined;
      }
      return {
        kind: 'light',
        lightType: value.lightType as SceneLightType,
      };
    }

    return undefined;
  } catch {
    return undefined;
  }
}
