import {
  createDefaultMaterialComponent,
  type MaterialComponent,
  type MaterialTextureBinding,
} from '@digital-twin/scene-schema';
import {
  BackSide,
  BoxGeometry,
  ClampToEdgeWrapping,
  Mesh,
  MeshBasicMaterial,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
  MirroredRepeatWrapping,
  NoColorSpace,
  RepeatWrapping,
  SRGBColorSpace,
  Texture,
  type MeshPhongMaterial,
} from 'three';
import { describe, expect, it, vi } from 'vitest';
import { AssetLoader } from '../src/assets/AssetLoader.js';
import {
  MaterialSystem,
  StaleMaterialLoadError,
  type TextureLoaderLike,
} from '../src/materials/MaterialSystem.js';
import type { AssetResolver } from '../src/assets/types.js';

function createResolver(): AssetResolver {
  return {
    resolve: vi.fn(async (assetId: string) => ({
      assetId,
      name: assetId,
      format: 'png' as const,
      url: `https://assets.test/${assetId}.png`,
    })),
  };
}

function createSystem(
  textureLoader: TextureLoaderLike = {
    loadAsync: vi.fn(async () => new Texture()),
  },
): MaterialSystem {
  return new MaterialSystem(createResolver(), { textureLoader });
}

function physicalComponent(): MaterialComponent {
  const component = createDefaultMaterialComponent();
  Object.assign(component, {
    materialType: 'physical',
    color: '#336699',
    transparent: true,
    opacity: 0.65,
    wireframe: true,
    side: 'back',
    roughness: 0.25,
    metalness: 0.75,
    emissive: '#220011',
    emissiveIntensity: 2,
    envMapIntensity: 1.4,
    clearcoat: 0.8,
    clearcoatRoughness: 0.15,
    reflectivity: 0.6,
    castShadow: true,
    receiveShadow: true,
  } satisfies Partial<MaterialComponent>);
  return component;
}

describe('MaterialSystem', () => {
  it('创建 Physical 覆盖并在恢复时保留模型原始共享材质', async () => {
    const original = new MeshStandardMaterial({ color: '#ffffff' });
    const disposeOriginal = vi.spyOn(original, 'dispose');
    const mesh = new Mesh(new BoxGeometry(), original);
    const system = createSystem();
    const generation = system.beginGeneration();

    const report = await system.apply(mesh, physicalComponent(), generation);

    expect(report).toEqual({ applied: true, errors: [] });
    expect(mesh.material).toBeInstanceOf(MeshPhysicalMaterial);
    expect(mesh.material).toMatchObject({
      opacity: 0.65,
      transparent: true,
      wireframe: true,
      side: BackSide,
      roughness: 0.25,
      metalness: 0.75,
      clearcoat: 0.8,
      clearcoatRoughness: 0.15,
      reflectivity: 0.6,
    });
    expect(mesh.castShadow).toBe(true);
    expect(mesh.receiveShadow).toBe(true);

    system.restore(mesh);
    system.restore(mesh);

    expect(mesh.material).toBe(original);
    expect(mesh.castShadow).toBe(false);
    expect(mesh.receiveShadow).toBe(false);
    expect(disposeOriginal).not.toHaveBeenCalled();
  });

  it('映射 Standard、Phong、Basic 并保持原 Material array 形态', async () => {
    const first = new MeshBasicMaterial();
    const second = new MeshBasicMaterial();
    const mesh = new Mesh(new BoxGeometry(), [first, second]);
    const system = createSystem();
    const generation = system.beginGeneration();
    const component = createDefaultMaterialComponent();

    await system.apply(mesh, component, generation);
    expect((mesh.material as unknown[])[0]).toBeInstanceOf(
      MeshStandardMaterial,
    );
    expect(mesh.material).toHaveLength(2);

    component.materialType = 'phong';
    component.specular = '#abcdef';
    component.shininess = 48;
    await system.apply(mesh, component, generation);
    expect((mesh.material as unknown as MeshPhongMaterial[])[0]).toMatchObject({
      shininess: 48,
    });

    component.materialType = 'basic';
    await system.apply(mesh, component, generation);
    expect((mesh.material as MeshBasicMaterial[])[0]).toBeInstanceOf(
      MeshBasicMaterial,
    );

    system.restore(mesh);
    expect(mesh.material).toEqual([first, second]);
  });

  it('按贴图用途设置颜色空间、UV 与包裹方式', async () => {
    const templates = new Map<string, Texture>();
    const loader: TextureLoaderLike = {
      loadAsync: vi.fn(async (url: string) => {
        const texture = new Texture();
        templates.set(url, texture);
        return texture;
      }),
    };
    const system = createSystem(loader);
    const mesh = new Mesh(new BoxGeometry(), new MeshStandardMaterial());
    const component = createDefaultMaterialComponent();
    const binding: MaterialTextureBinding = {
      assetId: 'base-color',
      offset: [0.25, 0.5],
      repeat: [2, 3],
      rotation: 0.4,
      wrapS: 'repeat',
      wrapT: 'mirror',
    };
    component.textures.baseColor = binding;
    component.textures.emissive = { ...binding, assetId: 'emissive' };
    component.textures.normal = {
      ...binding,
      assetId: 'normal',
      wrapS: 'clamp',
    };

    await system.apply(mesh, component, system.beginGeneration());

    const material = mesh.material as MeshStandardMaterial;
    expect(material.map?.colorSpace).toBe(SRGBColorSpace);
    expect(material.emissiveMap?.colorSpace).toBe(SRGBColorSpace);
    expect(material.normalMap?.colorSpace).toBe(NoColorSpace);
    expect(material.map?.offset.toArray()).toEqual([0.25, 0.5]);
    expect(material.map?.repeat.toArray()).toEqual([2, 3]);
    expect(material.map?.rotation).toBe(0.4);
    expect(material.map?.wrapS).toBe(RepeatWrapping);
    expect(material.map?.wrapT).toBe(MirroredRepeatWrapping);
    expect(material.normalMap?.wrapS).toBe(ClampToEdgeWrapping);
    expect(material.map).not.toBe(
      templates.get('https://assets.test/base-color.png'),
    );
  });

  it('单个贴图失败时保留其他材质参数并返回槽位错误', async () => {
    const loader: TextureLoaderLike = {
      loadAsync: vi.fn(async () => {
        throw new Error('图片解码失败');
      }),
    };
    const system = createSystem(loader);
    const mesh = new Mesh(new BoxGeometry(), new MeshStandardMaterial());
    const component = createDefaultMaterialComponent();
    component.textures.ao = {
      assetId: 'broken',
      offset: [0, 0],
      repeat: [1, 1],
      rotation: 0,
      wrapS: 'repeat',
      wrapT: 'repeat',
    };

    const report = await system.apply(
      mesh,
      component,
      system.beginGeneration(),
    );

    expect(mesh.material).toBeInstanceOf(MeshStandardMaterial);
    expect(report.errors).toEqual([{ slot: 'ao', message: '图片解码失败' }]);
  });

  it('丢弃场景切换后迟到的贴图并对称释放模板', async () => {
    let resolveTexture!: (texture: Texture) => void;
    const late = new Texture();
    const disposeLate = vi.spyOn(late, 'dispose');
    const loader: TextureLoaderLike = {
      loadAsync: vi.fn(
        () =>
          new Promise<Texture>((resolve) => {
            resolveTexture = resolve;
          }),
      ),
    };
    const system = createSystem(loader);
    const original = new MeshStandardMaterial();
    const mesh = new Mesh(new BoxGeometry(), original);
    const component = createDefaultMaterialComponent();
    component.textures.baseColor = {
      assetId: 'late',
      offset: [0, 0],
      repeat: [1, 1],
      rotation: 0,
      wrapS: 'repeat',
      wrapT: 'repeat',
    };
    const generation = system.beginGeneration();
    const applying = system.apply(mesh, component, generation);

    await vi.waitFor(() => expect(loader.loadAsync).toHaveBeenCalledOnce());
    system.beginGeneration();
    resolveTexture(late);

    await expect(applying).rejects.toBeInstanceOf(StaleMaterialLoadError);
    expect(mesh.material).toBe(original);
    expect(disposeLate).toHaveBeenCalledOnce();
  });

  it('模型 Loader 明确拒绝图片 descriptor', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const loader = new AssetLoader();

    await expect(
      loader.load({
        assetId: 'texture-1',
        name: '颜色贴图',
        format: 'png',
        url: 'https://assets.test/color.png',
      }),
    ).rejects.toThrow('图片资源必须由 MaterialSystem 加载');

    loader.dispose();
    warn.mockRestore();
  });
});
