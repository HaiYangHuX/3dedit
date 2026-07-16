import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

function source(path: string): string {
  return readFileSync(new URL(`../src/${path}`, import.meta.url), 'utf8');
}

describe('Three.js r183 兼容边界', () => {
  it('不再实例化 r183 已弃用的 Clock、RGBELoader 和 USDZLoader', () => {
    const engineSources = [
      source('EditorEngine.ts'),
      source('RuntimeThreeEngine.ts'),
    ].join('\n');
    const settings = source('settings/SceneSettingsSystem.ts');
    const assets = source('assets/AssetLoader.ts');

    expect(engineSources).not.toContain('Clock');
    expect(engineSources).toContain('Timer');
    expect(settings).not.toContain('RGBELoader');
    expect(settings).toContain('HDRLoader');
    expect(assets).not.toContain('USDZLoader');
    expect(assets).toContain('USDLoader');
  });
});
