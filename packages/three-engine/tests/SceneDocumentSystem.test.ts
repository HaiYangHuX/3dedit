import {
  AmbientLight,
  BoxGeometry,
  DirectionalLight,
  Group,
  HemisphereLight,
  Mesh,
  MeshStandardMaterial,
  PointLight,
  Scene,
  SpotLight,
} from 'three';
import {
  createDefaultSceneDocument,
  type SceneNode,
} from '@digital-twin/scene-schema';
import { describe, expect, it, vi } from 'vitest';
import {
  SceneDocumentSystem,
  type AssetInstanceProvider,
} from '../src/index.js';

function node(
  id: string,
  component: SceneNode['components'][number],
  parentId: string | null = null,
): SceneNode {
  return {
    id,
    parentId,
    childIds: [],
    name: id,
    enabled: true,
    locked: false,
    transform: {
      position: [1, 2, 3],
      rotation: [0.1, 0.2, 0.3],
      scale: [1, 1, 1],
    },
    components: [component],
    businessData: {},
  };
}

function modelRoot(): Group {
  const root = new Group();
  root.add(
    new Mesh(
      new BoxGeometry(1, 1, 1),
      new MeshStandardMaterial({ color: '#fff' }),
    ),
  );
  return root;
}

describe('SceneDocumentSystem', () => {
  it('加载多模型、几何体、五种灯光并恢复父子层级和变换', async () => {
    const scene = new Scene();
    let generation = 0;
    const assets: AssetInstanceProvider = {
      beginGeneration: vi.fn(() => ++generation),
      instantiate: vi.fn(async () => modelRoot()),
      release: vi.fn(() => true),
      dispose: vi.fn(),
    };
    const system = new SceneDocumentSystem(scene, assets);
    const document = createDefaultSceneDocument('project-1', 'scene-1', '场景');
    const modelA = node('model-a', { kind: 'model', assetId: 'asset-1' });
    const modelB = node('model-b', { kind: 'model', assetId: 'asset-1' });
    const box = node('box', { kind: 'geometry', primitive: 'box' }, modelA.id);
    modelA.childIds = [box.id];
    const lights = [
      node('ambient', {
        kind: 'light',
        lightType: 'ambient',
        color: '#fff',
        intensity: 1,
        castShadow: false,
      }),
      node('directional', {
        kind: 'light',
        lightType: 'directional',
        color: '#fff',
        intensity: 2,
        castShadow: true,
      }),
      node('hemisphere', {
        kind: 'light',
        lightType: 'hemisphere',
        color: '#fff',
        intensity: 1,
        castShadow: false,
      }),
      node('point', {
        kind: 'light',
        lightType: 'point',
        color: '#fff',
        intensity: 3,
        castShadow: true,
      }),
      node('spot', {
        kind: 'light',
        lightType: 'spot',
        color: '#fff',
        intensity: 4,
        castShadow: true,
      }),
    ];
    const all = [modelA, modelB, box, ...lights];
    document.nodes = Object.fromEntries(all.map((item) => [item.id, item]));
    document.rootNodeIds = [
      modelA.id,
      modelB.id,
      ...lights.map(({ id }) => id),
    ];

    const report = await system.loadDocument(document);

    expect(report.loadedNodeIds).toHaveLength(all.length);
    expect(assets.instantiate).toHaveBeenCalledTimes(2);
    expect(system.getObject('box')?.parent).toBe(system.getObject('model-a'));
    expect(system.getObject('model-a')?.position.toArray()).toEqual([1, 2, 3]);
    expect(system.getObject('box')).toBeInstanceOf(Mesh);
    expect(system.getObject('ambient')).toBeInstanceOf(AmbientLight);
    expect(system.getObject('directional')).toBeInstanceOf(DirectionalLight);
    expect(system.getObject('hemisphere')).toBeInstanceOf(HemisphereLight);
    expect(system.getObject('point')).toBeInstanceOf(PointLight);
    expect(system.getObject('spot')).toBeInstanceOf(SpotLight);
    expect(system.getNodeId(system.getObject('box')!)).toBe('box');
    expect(system.getStats()).toMatchObject({ objectCount: 8, meshCount: 3 });
  });

  it('属性面板切换几何体类型时替换并释放旧几何资源', async () => {
    const scene = new Scene();
    const assets: AssetInstanceProvider = {
      beginGeneration: vi.fn(() => 1),
      instantiate: vi.fn(async () => modelRoot()),
      release: vi.fn(() => false),
      dispose: vi.fn(),
    };
    const system = new SceneDocumentSystem(scene, assets);
    const document = createDefaultSceneDocument('project-1', 'scene-1', '场景');
    const box = node('box', { kind: 'geometry', primitive: 'box' });
    document.nodes = { box };
    document.rootNodeIds = ['box'];
    await system.loadDocument(document);
    const object = system.getObject('box') as Mesh;
    const oldGeometry = object.geometry;
    const dispose = vi.spyOn(oldGeometry, 'dispose');

    system.updateNode({
      ...box,
      components: [{ kind: 'geometry', primitive: 'sphere' }],
    });

    expect(object.geometry.type).toBe('SphereGeometry');
    expect(object.geometry).not.toBe(oldGeometry);
    expect(dispose).toHaveBeenCalledOnce();
    system.dispose();
  });

  it('统计不包含被隐藏祖先覆盖的子网格', async () => {
    const scene = new Scene();
    const assets: AssetInstanceProvider = {
      beginGeneration: vi.fn(() => 1),
      instantiate: vi.fn(async () => modelRoot()),
      release: vi.fn(() => false),
      dispose: vi.fn(),
    };
    const system = new SceneDocumentSystem(scene, assets);
    const document = createDefaultSceneDocument('project-1', 'scene-1', '场景');
    const parent = node('parent', { kind: 'text', data: {} });
    parent.enabled = false;
    parent.childIds = ['child'];
    const child = node(
      'child',
      { kind: 'geometry', primitive: 'box' },
      'parent',
    );
    document.nodes = { parent, child };
    document.rootNodeIds = ['parent'];
    await system.loadDocument(document);

    expect(system.getStats().meshCount).toBe(0);
    system.dispose();
  });

  it('切换场景时释放旧对象并只保留新文档节点', async () => {
    const scene = new Scene();
    let generation = 0;
    const firstModel = modelRoot();
    const assets: AssetInstanceProvider = {
      beginGeneration: vi.fn(() => ++generation),
      instantiate: vi.fn().mockResolvedValue(firstModel),
      release: vi.fn(() => true),
      dispose: vi.fn(),
    };
    const system = new SceneDocumentSystem(scene, assets);
    const first = createDefaultSceneDocument('project-1', 'scene-1', '场景一');
    const oldNode = node('old', { kind: 'model', assetId: 'asset-1' });
    first.nodes = { old: oldNode };
    first.rootNodeIds = ['old'];
    await system.loadDocument(first);

    const second = createDefaultSceneDocument('project-1', 'scene-2', '场景二');
    const nextNode = node('new', { kind: 'geometry', primitive: 'box' });
    second.nodes = { new: nextNode };
    second.rootNodeIds = ['new'];
    await system.loadDocument(second);

    expect(assets.release).toHaveBeenCalledWith(firstModel);
    expect(system.getObject('old')).toBeUndefined();
    expect(system.getObject('new')).toBeInstanceOf(Mesh);
    expect(system.root.children).toEqual([system.getObject('new')]);
    system.dispose();
    expect(assets.dispose).toHaveBeenCalledTimes(1);
  });
});
