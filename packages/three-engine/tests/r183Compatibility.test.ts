import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

function source(path: string): string {
  return readFileSync(new URL(`../src/${path}`, import.meta.url), 'utf8');
}

describe('Three.js r183 兼容边界', () => {
  it('不再实例化 r183 已弃用的 Clock、RGBELoader 和 USDZLoader', () => {
    const editorEngine = source('EditorEngine.ts');
    const runtimeEngine = source('RuntimeThreeEngine.ts');
    const engineSources = [editorEngine, runtimeEngine].join('\n');
    const settings = source('settings/SceneSettingsSystem.ts');
    const assets = source('assets/AssetLoader.ts');

    expect(engineSources).not.toContain('Clock');
    expect(engineSources).toContain('Timer');
    expect(settings).not.toContain('RGBELoader');
    expect(settings).toContain('HDRLoader');
    expect(assets).not.toContain('USDZLoader');
    expect(assets).toContain('USDLoader');
    // r183 官方 RoomEnvironment 在无用户 HDR 时提供稳定的编辑器 PBR 光照。
    expect(editorEngine).toContain('RoomEnvironment');
    expect(editorEngine).toContain('fromScene(roomEnvironment)');
    // RenderPass/OutlinePass 使用线性中间缓冲，r183 必须由末尾 OutputPass 输出到 sRGB。
    expect(editorEngine).toContain('OutputPass');
    expect(editorEngine.indexOf('addPass(this.outline)')).toBeLessThan(
      editorEngine.indexOf('addPass(this.output)'),
    );
    expect(runtimeEngine).toContain('OutputPass');
    expect(runtimeEngine.indexOf('addPass(outline)')).toBeLessThan(
      runtimeEngine.indexOf('addPass(output)'),
    );
    for (const sourceCode of [editorEngine, runtimeEngine])
      expect(sourceCode).toContain('output?.dispose()');
  });
});
