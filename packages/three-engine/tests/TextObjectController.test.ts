import {
  createDefaultTextComponent,
  type TextComponent,
} from '@digital-twin/scene-schema';
import {
  CanvasTexture,
  Mesh,
  MeshBasicMaterial,
  Sprite,
  SpriteMaterial,
} from 'three';
import { describe, expect, it, vi } from 'vitest';
import {
  createTextObject,
  setTextObjectContent,
  updateTextObject,
} from '../src/index.js';

function canvas(width: number, height: number): HTMLCanvasElement {
  return { width, height } as HTMLCanvasElement;
}

describe('TextObjectController', () => {
  it('创建面向屏幕的高分辨率 Canvas 文本并按宽高比设置尺寸', () => {
    const component = createDefaultTextComponent('CreatePlainTextCanvas');
    const renderCanvas = vi.fn(() => canvas(1_200, 300));

    const root = createTextObject(component, { renderCanvas });
    const sprite = root.children[0] as Sprite;

    expect(sprite).toBeInstanceOf(Sprite);
    expect(sprite.scale.toArray()).toEqual([4, 1, 1]);
    expect(sprite.material).toBeInstanceOf(SpriteMaterial);
    expect(sprite.material.map).toBeInstanceOf(CanvasTexture);
    expect(sprite.material.transparent).toBe(true);
    expect(sprite.material.alphaTest).toBe(0.1);
    expect(sprite.material.depthWrite).toBe(true);
    expect(root.userData.textMethod).toBe('CreatePlainTextCanvas');
    expect(root.userData.textType).toBe('Sprite');
    expect(renderCanvas).toHaveBeenCalledWith(component);
  });

  it('同类型更新保留显示对象并释放被替换的纹理', () => {
    const component = createDefaultTextComponent('CreateFixedCanvas');
    const renderCanvas = vi
      .fn<(component: TextComponent) => HTMLCanvasElement>()
      .mockReturnValueOnce(canvas(900, 600))
      .mockReturnValueOnce(canvas(1_200, 600));
    const root = createTextObject(component, { renderCanvas });
    const sprite = root.children[0] as Sprite;
    const oldTexture = sprite.material.map!;
    const dispose = vi.spyOn(oldTexture, 'dispose');

    const updated = { ...component, textContent: '设备告警' };
    expect(updateTextObject(root, updated)).toBe(true);

    expect(root.children[0]).toBe(sprite);
    expect(dispose).toHaveBeenCalledOnce();
    expect(sprite.scale.toArray()).toEqual([2, 1, 1]);
    expect(root.userData.textContent).toBe('设备告警');
  });

  it('切换为面向场景时只替换显示子节点并释放旧材质', () => {
    const component = createDefaultTextComponent('CreateDigitalTwin');
    const renderCanvas = vi.fn(() => canvas(1_200, 400));
    const root = createTextObject(component, { renderCanvas });
    const sprite = root.children[0] as Sprite;
    const materialDispose = vi.spyOn(sprite.material, 'dispose');
    const textureDispose = vi.spyOn(sprite.material.map!, 'dispose');

    expect(updateTextObject(root, { ...component, textType: 'Mesh' })).toBe(
      true,
    );

    const mesh = root.children[0] as Mesh;
    expect(mesh).toBeInstanceOf(Mesh);
    expect(mesh.material).toBeInstanceOf(MeshBasicMaterial);
    expect(mesh.scale.toArray()).toEqual([3, 1, 1]);
    expect(mesh.castShadow).toBe(true);
    expect(materialDispose).toHaveBeenCalledOnce();
    expect(textureDispose).toHaveBeenCalledOnce();
    expect(root.userData.textType).toBe('Mesh');
  });

  it('运行时文本动作更新真实纹理并保留模板其他配置', () => {
    const component = createDefaultTextComponent('CreateCyberHud');
    const renderCanvas = vi.fn(() => canvas(1_260, 420));
    const root = createTextObject(component, { renderCanvas });

    expect(setTextObjectContent(root, '区域 B-12 已锁定')).toBe(true);
    expect(renderCanvas).toHaveBeenLastCalledWith({
      ...component,
      textContent: '区域 B-12 已锁定',
    });
    expect(root.userData.textContent).toBe('区域 B-12 已锁定');
  });
});
