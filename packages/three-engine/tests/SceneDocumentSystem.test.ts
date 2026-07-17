import {
  AmbientLight,
  BoxGeometry,
  DirectionalLight,
  Group,
  HemisphereLight,
  Mesh,
  MeshStandardMaterial,
  Object3D,
  PointLight,
  Scene,
  SpotLight,
} from 'three';
import {
  createDefaultMaterialComponent,
  createDefaultSceneDocument,
  type SceneNode,
} from '@digital-twin/scene-schema';
import { describe, expect, it, vi } from 'vitest';
import {
  SceneDocumentSystem,
  type AssetInstanceProvider,
  type MaterialProjectionSystem,
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
  it('在节点创建更新删除和销毁时对称驱动材质投影', async () => {
    const scene = new Scene();
    const assets: AssetInstanceProvider = {
      beginGeneration: vi.fn(() => 1),
      instantiate: vi.fn(async () => modelRoot()),
      release: vi.fn(() => false),
      dispose: vi.fn(),
    };
    const materials: MaterialProjectionSystem = {
      beginGeneration: vi.fn(() => 7),
      apply: vi.fn(async () => ({ applied: true, errors: [] })),
      restore: vi.fn(),
      dispose: vi.fn(),
    };
    const system = new SceneDocumentSystem(scene, assets, materials);
    const document = createDefaultSceneDocument('project-1', 'scene-1', '场景');
    const box = node('box', { kind: 'geometry', primitive: 'box' });
    const material = createDefaultMaterialComponent();
    box.components.push(material);
    document.nodes = { box };
    document.rootNodeIds = ['box'];

    await system.loadDocument(document);
    const object = system.getObject('box')!;
    expect(materials.apply).toHaveBeenCalledWith(object, material, 7);

    const changed = structuredClone(box);
    const changedMaterial = changed.components.find(
      (component) => component.kind === 'material',
    );
    if (changedMaterial?.kind === 'material') changedMaterial.roughness = 0.2;
    await system.updateNode(changed);
    expect(materials.apply).toHaveBeenLastCalledWith(
      object,
      changedMaterial,
      7,
    );

    system.removeNodes(['box']);
    expect(materials.restore).toHaveBeenCalledWith(object);
    expect(
      vi.mocked(materials.restore).mock.invocationCallOrder.at(-1),
    ).toBeLessThan(vi.mocked(assets.release).mock.invocationCallOrder.at(-1)!);
    system.dispose();
    expect(materials.dispose).toHaveBeenCalledOnce();
  });

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

  it('从真实 Object3D 投影模型内部结构并排除业务子节点', async () => {
    const scene = new Scene();
    const modelObject = new Group();
    const assembly = new Group();
    assembly.name = '装配体';
    const unnamedMesh = new Mesh(
      new BoxGeometry(1, 1, 1),
      new MeshStandardMaterial({ color: '#fff' }),
    );
    assembly.add(unnamedMesh);
    modelObject.add(assembly);
    const assets: AssetInstanceProvider = {
      beginGeneration: vi.fn(() => 1),
      instantiate: vi.fn(async () => modelObject),
      release: vi.fn(() => true),
      dispose: vi.fn(),
    };
    const system = new SceneDocumentSystem(scene, assets);
    const document = createDefaultSceneDocument('project-1', 'scene-1', '场景');
    const model = node('model', { kind: 'model', assetId: 'asset-1' });
    const businessChild = node(
      'business-child',
      { kind: 'geometry', primitive: 'box' },
      model.id,
    );
    model.childIds = [businessChild.id];
    document.nodes = { model, 'business-child': businessChild };
    document.rootNodeIds = [model.id];

    await system.loadDocument(document);

    expect(system.getModelStructures()).toEqual({
      model: [
        {
          objectId: assembly.uuid,
          name: '装配体',
          objectType: 'Group',
          children: [
            {
              objectId: unnamedMesh.uuid,
              name: 'Mesh',
              objectType: 'Mesh',
              children: [],
            },
          ],
        },
      ],
    });
  });

  it('展示树打平与业务根同名的单一模型包装组', async () => {
    const scene = new Scene();
    const modelObject = new Group();
    const redundantWrapper = new Object3D();
    redundantWrapper.name = '清洗机';
    const mesh = new Mesh(
      new BoxGeometry(1, 1, 1),
      new MeshStandardMaterial({ color: '#fff' }),
    );
    mesh.name = '叶轮';
    redundantWrapper.add(mesh);
    modelObject.add(redundantWrapper);
    const assets: AssetInstanceProvider = {
      beginGeneration: vi.fn(() => 1),
      instantiate: vi.fn(async () => modelObject),
      release: vi.fn(() => true),
      dispose: vi.fn(),
    };
    const system = new SceneDocumentSystem(scene, assets);
    const document = createDefaultSceneDocument('project-1', 'scene-1', '场景');
    const model = node('model', { kind: 'model', assetId: 'asset-1' });
    model.name = '清洗机';
    document.nodes = { model };
    document.rootNodeIds = [model.id];

    await system.loadDocument(document);

    expect(system.getModelStructures().model).toEqual([
      {
        objectId: mesh.uuid,
        name: '叶轮',
        objectType: 'Mesh',
        children: [],
      },
    ]);
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

  it('模型 assetId 改变时先创建新对象再原子替换旧节点', async () => {
    const scene = new Scene();
    const assets: AssetInstanceProvider = {
      beginGeneration: vi.fn(() => 1),
      instantiate: vi.fn(async (assetId: string) => {
        const root = modelRoot();
        root.userData.assetId = assetId;
        return root;
      }),
      release: vi.fn(() => true),
      dispose: vi.fn(),
    };
    const system = new SceneDocumentSystem(scene, assets);
    const document = createDefaultSceneDocument('project-1', 'scene-1', '场景');
    const model = node('model', { kind: 'model', assetId: 'asset-old' });
    document.nodes = { model };
    document.rootNodeIds = ['model'];
    await system.loadDocument(document);
    const oldObject = system.getObject('model');

    await system.updateNode({
      ...model,
      components: [{ kind: 'model', assetId: 'asset-new' }],
    });
    const replacement = system.getObject('model')!;

    expect(replacement).not.toBe(oldObject);
    expect(replacement.userData.assetId).toBe('asset-new');
    expect(system.root.children).toEqual([replacement]);
    expect(assets.release).toHaveBeenCalledWith(oldObject);
    system.dispose();
  });
});
