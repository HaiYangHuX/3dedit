import type { SceneSettings } from '@digital-twin/scene-schema';

// URL 必须保持字面量，Vite 才能在 editor/runtime 两个入口中稳定收集这些资源。
const environmentUrl = new URL('./assets/view-hdr-1.hdr', import.meta.url).href;
const lawnColorUrl = new URL(
  './assets/textures-7-DyLlJimJ.jpg',
  import.meta.url,
).href;
const lawnNormalUrl = new URL(
  './assets/textures-normal-7-vknICg0W.jpg',
  import.meta.url,
).href;
const lawnDirtUrl = new URL('./assets/dirt_color-B2oGo9Tb.jpg', import.meta.url)
  .href;
const rockColorUrl = new URL(
  './assets/textures-3-DKnq1pJT.png',
  import.meta.url,
).href;
const rockNormalUrl = new URL(
  './assets/textures-normal-3-BQMpXC0h.png',
  import.meta.url,
).href;
const stoneColorUrl = new URL(
  './assets/textures-6-DcX_pjN_.png',
  import.meta.url,
).href;
const stoneNormalUrl = new URL(
  './assets/textures-normal-6-Jl9C8kD0.png',
  import.meta.url,
).href;
const floorColorUrl = new URL(
  './assets/textures-2-DC42pSt0.png',
  import.meta.url,
).href;
const floorNormalUrl = new URL(
  './assets/textures-normal-2-BTqti9_d.png',
  import.meta.url,
).href;
const tile1ColorUrl = new URL(
  './assets/textures-1-DrrmmzDt.jpg',
  import.meta.url,
).href;
const textureNormal1Url = new URL(
  './assets/textures-normal-1-BlJEYbDL.png',
  import.meta.url,
).href;
const tile2ColorUrl = new URL(
  './assets/textures-4-B1eiutEA.jpg',
  import.meta.url,
).href;
const tile2NormalUrl = new URL(
  './assets/textures-normal-4-BkZedWlP.jpg',
  import.meta.url,
).href;
const brickColorUrl = new URL(
  './assets/textures-5-BeWesvXD.png',
  import.meta.url,
).href;
const brickNormalUrl = new URL(
  './assets/textures-normal-5-BRrs1igq.png',
  import.meta.url,
).href;
const grassModelUrl = new URL('./assets/grass.glb', import.meta.url).href;
const flowerWhiteModelUrl = new URL(
  './assets/flower_white.glb',
  import.meta.url,
).href;
const flowerBlueModelUrl = new URL('./assets/flower_blue.glb', import.meta.url)
  .href;
const flowerYellowModelUrl = new URL(
  './assets/flower_yellow.glb',
  import.meta.url,
).href;
const rainSpriteUrl = new URL('./assets/rain-B31LYEhi.png', import.meta.url)
  .href;
const snowSpriteUrl = new URL(
  './assets/snowflake-BEmTO7u1.png',
  import.meta.url,
).href;

/** 供哈希回归测试遍历的源站原始文件；预览图是本地派生资源，不列入源文件哈希。 */
export const BUILTIN_ASSET_URLS = {
  environment: environmentUrl,
  lawnColor: lawnColorUrl,
  lawnNormal: lawnNormalUrl,
  lawnDirt: lawnDirtUrl,
  rockColor: rockColorUrl,
  rockNormal: rockNormalUrl,
  stoneColor: stoneColorUrl,
  stoneNormal: stoneNormalUrl,
  floorColor: floorColorUrl,
  floorNormal: floorNormalUrl,
  tile1Color: tile1ColorUrl,
  // 源站实际将地砖（1）与地板共用 normal-2，normal-1 仅作资源完整性保留。
  tile1Normal: floorNormalUrl,
  textureNormal1: textureNormal1Url,
  tile2Color: tile2ColorUrl,
  tile2Normal: tile2NormalUrl,
  brickColor: brickColorUrl,
  brickNormal: brickNormalUrl,
  grassModel: grassModelUrl,
  flowerWhiteModel: flowerWhiteModelUrl,
  flowerBlueModel: flowerBlueModelUrl,
  flowerYellowModel: flowerYellowModelUrl,
  rainSprite: rainSpriteUrl,
  snowSprite: snowSpriteUrl,
} as const;

export const BUILTIN_ENVIRONMENT_URL = environmentUrl;
export const BUILTIN_ENVIRONMENT_PREVIEW_URL = new URL(
  './assets/venice-sunset-preview.jpg',
  import.meta.url,
).href;

type GroundAssetKey = Exclude<SceneSettings['groundType'], 'none' | 'grid'>;

export interface GroundAssetDefinition {
  label: string;
  mapUrl: string;
  normalMapUrl: string;
  dirtMapUrl?: string;
}

/** 字段配对直接源自 ThreeFlowX r183 的 Bn 地面配置数组。 */
export const GROUND_ASSETS: Record<GroundAssetKey, GroundAssetDefinition> = {
  lawn: {
    label: '草坪',
    mapUrl: lawnColorUrl,
    normalMapUrl: lawnNormalUrl,
    dirtMapUrl: lawnDirtUrl,
  },
  rock: {
    label: '岩石',
    mapUrl: rockColorUrl,
    normalMapUrl: rockNormalUrl,
  },
  stone: {
    label: '砂石',
    mapUrl: stoneColorUrl,
    normalMapUrl: stoneNormalUrl,
  },
  floor: {
    label: '地板',
    mapUrl: floorColorUrl,
    normalMapUrl: floorNormalUrl,
  },
  'tile-1': {
    label: '地砖（1）',
    mapUrl: tile1ColorUrl,
    normalMapUrl: floorNormalUrl,
  },
  'tile-2': {
    label: '地砖（2）',
    mapUrl: tile2ColorUrl,
    normalMapUrl: tile2NormalUrl,
  },
  brick: {
    label: '板砖',
    mapUrl: brickColorUrl,
    normalMapUrl: brickNormalUrl,
  },
};

export const LAWN_MODEL_ASSETS = {
  grass: grassModelUrl,
  flowers: [flowerWhiteModelUrl, flowerBlueModelUrl, flowerYellowModelUrl],
} as const;

export const WEATHER_ASSETS = {
  rain: rainSpriteUrl,
  snow: snowSpriteUrl,
} as const;
