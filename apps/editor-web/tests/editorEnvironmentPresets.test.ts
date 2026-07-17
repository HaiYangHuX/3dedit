import { BUILTIN_ENVIRONMENT_ASSETS } from '@digital-twin/three-engine';
import { describe, expect, it, vi } from 'vitest';
import { assetApi } from '../src/api/assets';
import { editorAssetResolver } from '../src/three/editorAssetResolver';

vi.mock('../src/api/assets', () => ({
  assetApi: { get: vi.fn() },
}));

describe('编辑器内置环境预设', () => {
  it('通过本地预设 ID 解析，不访问模型库接口', async () => {
    // 预设清单由引擎包提供，测试用首项验证本地 URL 协议；清单为空应在构建阶段暴露。
    const preset = BUILTIN_ENVIRONMENT_ASSETS[0]!;

    await expect(editorAssetResolver.resolve(preset.id)).resolves.toEqual({
      assetId: preset.id,
      name: preset.name,
      format: preset.format,
      url: preset.url,
    });
    expect(assetApi.get).not.toHaveBeenCalled();
  });
});
