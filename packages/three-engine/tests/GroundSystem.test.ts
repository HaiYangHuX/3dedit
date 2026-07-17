import type { SceneSettings } from '@digital-twin/scene-schema';
import {
  DoubleSide,
  Group,
  InstancedMesh,
  Mesh,
  MeshBasicMaterial,
  PlaneGeometry,
  Scene,
  Texture,
  type GridHelper,
  type MeshPhongMaterial,
  type MeshStandardMaterial,
} from 'three';
import { describe, expect, it, vi } from 'vitest';
import { GroundSystem } from '../src/index.js';

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

function modelScene(withTexture = false): Group {
  const group = new Group();
  const material = new MeshBasicMaterial();
  if (withTexture) material.map = new Texture();
  group.add(new Mesh(new PlaneGeometry(1, 1), material));
  return group;
}

describe('GroundSystem', () => {
  it('还原源站 200 米双层网格', async () => {
    const scene = new Scene();
    const system = new GroundSystem(scene);

    await system.apply('grid');

    const root = scene.children[0] as Group;
    const grids = root.children as GridHelper[];
    expect(root.userData.isGridHelper).toBe(true);
    expect(grids).toHaveLength(2);
    expect(grids[0]!.geometry.getAttribute('position').count).toBe(8_004);
    expect(grids[1]!.geometry.getAttribute('position').count).toBe(804);
    expect(grids[0]!.material).toMatchObject({
      transparent: true,
      opacity: 0.1,
      depthWrite: false,
    });
    expect(grids[1]!.material).toMatchObject({
      transparent: true,
      opacity: 0.3,
    });
    expect(grids[0]!.renderOrder).toBe(-1);
    expect(grids[1]!.renderOrder).toBe(-1);
    const geometryDisposes = grids.map((grid) =>
      vi.spyOn(grid.geometry, 'dispose'),
    );
    const materialDisposes = grids.map((grid) =>
      vi.spyOn(
        Array.isArray(grid.material) ? grid.material[0]! : grid.material,
        'dispose',
      ),
    );
    system.dispose();
    expect(scene.children).toHaveLength(0);
    geometryDisposes.forEach((dispose) =>
      expect(dispose).toHaveBeenCalledOnce(),
    );
    materialDisposes.forEach((dispose) =>
      expect(dispose).toHaveBeenCalledOnce(),
    );
  });

  it('地板与三种地砖使用源站几何、PBR 参数和纹理重复', async () => {
    const scene = new Scene();
    const textures: Texture[] = [];
    const textureLoader = {
      loadAsync: vi.fn(async () => {
        const texture = new Texture();
        textures.push(texture);
        return texture;
      }),
    };
    const system = new GroundSystem(scene, { textureLoader });

    for (const type of [
      'floor',
      'tile-1',
      'tile-2',
      'brick',
    ] satisfies SceneSettings['groundType'][]) {
      await system.apply(type);
      const mesh = scene.getObjectByName('customPlane') as Mesh<
        PlaneGeometry,
        MeshStandardMaterial
      >;
      expect(mesh.userData.planeGeometry).toBe(type);
      expect(mesh.geometry.parameters).toMatchObject({
        width: 1_500,
        height: 1_500,
      });
      expect(mesh.rotation.x).toBeCloseTo(-Math.PI / 2);
      expect(mesh.receiveShadow).toBe(true);
      expect(mesh.material).toMatchObject({
        roughness: 0.8,
        metalness: 0.2,
        side: DoubleSide,
      });
      expect(mesh.material.map?.repeat.toArray()).toEqual([1_000, 1_000]);
      expect(mesh.material.normalMap).toBeInstanceOf(Texture);
    }
    expect(textureLoader.loadAsync).toHaveBeenCalledTimes(8);
    system.dispose();
  });

  it('创建草坪、岩石和砂石的源站程序化结构', async () => {
    const scene = new Scene();
    const textureLoader = {
      loadAsync: vi.fn(async () => new Texture()),
    };
    const modelLoader = {
      loadAsync: vi.fn(async (url: string) => ({
        scene: modelScene(url.endsWith('grass.glb')),
      })),
    };
    const system = new GroundSystem(scene, {
      textureLoader,
      modelLoader,
      random: () => 0.1,
    });

    await system.apply('lawn');
    expect(system.isAnimated).toBe(true);
    const lawn = scene.getObjectByName('customPlane') as Group;
    expect(lawn.userData.planeGeometry).toBe('lawn');
    expect(lawn.children.some((child) => child instanceof InstancedMesh)).toBe(
      true,
    );
    system.update(12.5);
    const windMaterial = lawn.userData.windMaterials[0] as MeshBasicMaterial;
    expect(windMaterial.userData.windTime).toBe(12.5);

    await system.apply('rock');
    expect(system.isAnimated).toBe(false);
    const rock = scene.getObjectByName('customPlane') as Group;
    expect(rock.userData.planeGeometry).toBe('rock');
    expect(
      (
        rock.children[0] as Mesh<PlaneGeometry, MeshPhongMaterial>
      ).material.emissive.getHex(),
    ).toBe(0x2a241c);
    expect(
      rock.children.some(
        (child) =>
          child instanceof Group &&
          child.children.some((entry) => entry instanceof InstancedMesh),
      ),
    ).toBe(true);

    await system.apply('stone');
    const stone = scene.getObjectByName('customPlane') as Group;
    expect(stone.userData.planeGeometry).toBe('stone');
    expect(stone.children).toHaveLength(1);
    expect(stone.children[0]).toBeInstanceOf(Mesh);
    system.dispose();
  });

  it('快速切换时释放迟到地面而不覆盖最新类型', async () => {
    const scene = new Scene();
    const colorLoad = deferred<Texture>();
    const normalLoad = deferred<Texture>();
    const color = new Texture();
    const normal = new Texture();
    const colorDispose = vi.spyOn(color, 'dispose');
    const normalDispose = vi.spyOn(normal, 'dispose');
    const textureLoader = {
      loadAsync: vi
        .fn()
        .mockReturnValueOnce(colorLoad.promise)
        .mockReturnValueOnce(normalLoad.promise),
    };
    const system = new GroundSystem(scene, { textureLoader });

    const floor = system.apply('floor');
    await vi.waitFor(() =>
      expect(textureLoader.loadAsync).toHaveBeenCalledTimes(2),
    );
    await system.apply('none');
    colorLoad.resolve(color);
    normalLoad.resolve(normal);
    await floor;

    expect(scene.children).toHaveLength(0);
    expect(colorDispose).toHaveBeenCalledOnce();
    expect(normalDispose).toHaveBeenCalledOnce();
    system.dispose();
  });
});
