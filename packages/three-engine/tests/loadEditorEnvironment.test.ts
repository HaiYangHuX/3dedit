import { Texture } from 'three';
import { describe, expect, it, vi } from 'vitest';
import { loadEditorEnvironment } from '../src/settings/loadEditorEnvironment.js';

describe('loadEditorEnvironment', () => {
  it('从指定 HDR 生成 PMREM，并在转换后释放源纹理', async () => {
    const source = new Texture();
    const disposeSource = vi.spyOn(source, 'dispose');
    const target = { texture: new Texture(), dispose: vi.fn() };
    const loader = { loadAsync: vi.fn(async () => source) };
    const generator = {
      fromEquirectangular: vi.fn(() => target),
      dispose: vi.fn(),
    };

    const result = await loadEditorEnvironment('/hdr/venice.hdr', {
      loader,
      generator,
    });

    expect(loader.loadAsync).toHaveBeenCalledWith('/hdr/venice.hdr');
    expect(generator.fromEquirectangular).toHaveBeenCalledWith(source);
    expect(disposeSource).toHaveBeenCalledOnce();
    expect(result).toBe(target);
  });

  it('组件已卸载时只释放迟到纹理，不再调用依赖 WebGLRenderer 的 PMREM', async () => {
    const source = new Texture();
    const disposeSource = vi.spyOn(source, 'dispose');
    const generator = {
      fromEquirectangular: vi.fn(),
      dispose: vi.fn(),
    };

    const result = await loadEditorEnvironment('/hdr/venice.hdr', {
      loader: { loadAsync: vi.fn(async () => source) },
      generator,
      isStale: () => true,
    });

    expect(result).toBeUndefined();
    expect(disposeSource).toHaveBeenCalledOnce();
    expect(generator.fromEquirectangular).not.toHaveBeenCalled();
  });

  it('PMREM 转换抛错时仍释放已加载的 HDR 纹理', async () => {
    const source = new Texture();
    const disposeSource = vi.spyOn(source, 'dispose');
    const generator = {
      fromEquirectangular: vi.fn(() => {
        throw new Error('PMREM failed');
      }),
      dispose: vi.fn(),
    };

    await expect(
      loadEditorEnvironment('/hdr/venice.hdr', {
        loader: { loadAsync: vi.fn(async () => source) },
        generator,
      }),
    ).rejects.toThrow('PMREM failed');
    expect(disposeSource).toHaveBeenCalledOnce();
  });
});
