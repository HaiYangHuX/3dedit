import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  BUILTIN_ASSET_URLS,
  BUILTIN_ENVIRONMENT_PREVIEW_URL,
  BUILTIN_ENVIRONMENT_ASSETS,
  BUILTIN_ENVIRONMENT_URL,
  GROUND_ASSETS,
  WEATHER_ASSETS,
} from '../src/settings/builtinAssets.js';

const expectedHashes: Record<keyof typeof BUILTIN_ASSET_URLS, string> = {
  environment:
    '0e72ed46b5316cb5fb67fc81ff85b024a09146fd89ef3811a8d2299647ada118',
  lawnColor: '632d94c4225546aa57db7b75b3f6819c4cc95343b4b7add5ada44688f8722942',
  lawnNormal:
    '2556aa1200aff376017a339cb3496f1319d0a84d58824f220d6f7c033eb4c3ca',
  lawnDirt: '3b351b84a58976fab734d295fb164f87fb00507e73c095a8b3c6766e3d12684a',
  rockColor: 'd84a9b8c1e9d98a7b25d843ddad2c235d22f2a74e5892f4a2e313f3961dff1b9',
  rockNormal:
    '23d68fbdc6e75a7ba6a8d4e7c9619b47df2078a4ed3d9a0385671fc1af66f70a',
  stoneColor:
    'e4f63098271faac7a054d8b962a14c43962ba37ca1445f730f89bc92602d9c74',
  stoneNormal:
    'aba06bfc4efe0dc5bc15fab345d5be3b903ad1c4fddb4e05c89dd09954270b73',
  floorColor:
    'fbf7fbbffe91df8a6d7de94c8f1fd123f66e1bbd02ad9c9c811c47720817f80f',
  floorNormal:
    '2da731ddce864fef94b144cb2e293bb4727b3664c6af51906c7999556a5ec8f5',
  tile1Color:
    '6a3e396734b5dc87a4f3c7bd1c6e66a6f0c793e9737a6c71a17c35fc5e866df0',
  tile1Normal:
    '2da731ddce864fef94b144cb2e293bb4727b3664c6af51906c7999556a5ec8f5',
  textureNormal1:
    '32677153ad8e38d60c227f804ffff098130582ee9bb3c2b162e670b97c1f2bf4',
  tile2Color:
    '2448f2e90e66961d9dd1bd65b4f3fb1cb38b53d46afb43e1151e841ca996b131',
  tile2Normal:
    'd2ecfa4738ae17d0de8052a9b3cea8b50d7f2f729e7c14c83db8874216c3ca77',
  brickColor:
    'b48695cd0362b6a2c04c741ead5fdfbd9e7f7c4206918be85c5b97df470650a1',
  brickNormal:
    '951801e2407c3250a051145deee7e6e246832746fd13db5eb0e4984112465b6d',
  grassModel:
    '13f83e0a6b7a8756642e030bcbe7e335092a1bad3d6f42a3d65f422a25016c28',
  flowerWhiteModel:
    'b38fd66e59764f21c2ed1054717817161bf8bbc28c7947e7f3a5f3fa6fdaea9b',
  flowerBlueModel:
    '1174f9130672bef1b5aa7e30a6d8b7ba8128ce59fa5c9d462ff04c21831851a8',
  flowerYellowModel:
    '778351964bf00f586a86280c9324376e9be845703d65566e24c74374cdd04f81',
  rainSprite:
    'a09ebf6fe81b012dfcdc512c831dbec29e67ecfc03e23d0f46a74d4b61e843a6',
  snowSprite:
    '90744bba21624d434e850521b28ef04f72c5d66c571c671522f9e0bead692afb',
};

describe('ThreeFlowX 内置项目资源', () => {
  it('保留经取证的原始文件哈希', async () => {
    for (const [name, url] of Object.entries(BUILTIN_ASSET_URLS)) {
      const content = await readFile(fileURLToPath(url));
      expect(createHash('sha256').update(content).digest('hex'), name).toBe(
        expectedHashes[name as keyof typeof BUILTIN_ASSET_URLS],
      );
      expect(url).not.toContain('threeflowx.cn');
    }
  });

  it('按源站真实组合地面纹理并提供本地环境预览', () => {
    expect(GROUND_ASSETS['tile-1']).toMatchObject({
      mapUrl: BUILTIN_ASSET_URLS.tile1Color,
      normalMapUrl: BUILTIN_ASSET_URLS.tile1Normal,
    });
    expect(GROUND_ASSETS.lawn.dirtMapUrl).toBe(BUILTIN_ASSET_URLS.lawnDirt);
    expect(WEATHER_ASSETS).toEqual({
      rain: BUILTIN_ASSET_URLS.rainSprite,
      snow: BUILTIN_ASSET_URLS.snowSprite,
    });
    expect(BUILTIN_ENVIRONMENT_URL).toBe(BUILTIN_ASSET_URLS.environment);
    expect(BUILTIN_ENVIRONMENT_PREVIEW_URL).toMatch(/\.jpg$/);
  });

  it('内置六张环境结果图通过稳定 ID 和本地 URL 暴露', async () => {
    expect(BUILTIN_ENVIRONMENT_ASSETS).toHaveLength(6);
    for (const asset of BUILTIN_ENVIRONMENT_ASSETS) {
      const content = await readFile(fileURLToPath(asset.url));
      expect(content.byteLength).toBeGreaterThan(0);
      expect(asset.url).not.toContain('threeflowx.cn');
      expect(asset.previewUrl).toBe(asset.url);
    }
  });
});
