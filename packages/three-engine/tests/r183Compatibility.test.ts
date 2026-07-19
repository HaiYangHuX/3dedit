import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

function source(path: string): string {
  return readFileSync(new URL(`../src/${path}`, import.meta.url), 'utf8');
}

describe('Three.js r183 兼容边界', () => {
  it('使用 r183 HDR、颜色输出与编辑选择能力，且不回退到过时 API', () => {
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
    // 默认主路径必须是与源站一致的 Venice HDR；RoomEnvironment 只能留作加载失败兜底。
    expect(editorEngine).toContain('DEFAULT_EDITOR_ENVIRONMENT_URL');
    expect(editorEngine).toContain('BUILTIN_ENVIRONMENT_URL');
    expect(editorEngine).toContain('loadEditorEnvironment');
    expect(editorEngine).toContain(
      'environmentRotation.set(0, Math.PI / 2, 0)',
    );
    expect(editorEngine.indexOf('loadEditorEnvironment')).toBeLessThan(
      editorEngine.indexOf('fromScene(roomEnvironment)'),
    );
    // 编辑器不再用白色 Outline 覆盖模型；运行时交互高亮仍保留 OutlinePass。
    expect(editorEngine).not.toContain('new OutlinePass');
    expect(runtimeEngine).toContain('new OutlinePass');

    // 原站编辑器直接写入默认 framebuffer，才能使 WebGLRenderer 的 MSAA 生效。
    // 只有运行时 OutlinePass 需要 Composer，不能把这条链路误用到编辑器。
    expect(editorEngine).not.toContain('EffectComposer');
    expect(editorEngine).not.toContain('RenderPass');
    expect(editorEngine).not.toContain('OutputPass');
    expect(editorEngine).toContain(
      'this.renderer?.render(this.scene, this.camera)',
    );
    expect(editorEngine).toContain('stencil: false');
    expect(editorEngine).toContain('depth: true');
    expect(editorEngine).toContain('logarithmicDepthBuffer: false');
    expect(editorEngine).toContain('renderer.autoClear = false');

    // 运行时的后期管线仍必须由末尾 OutputPass 输出到 sRGB。
    expect(runtimeEngine).toContain('OutputPass');
    expect(runtimeEngine.indexOf('addPass(outline)')).toBeLessThan(
      runtimeEngine.indexOf('addPass(output)'),
    );
    expect(runtimeEngine).toContain('output?.dispose()');
  });
});
