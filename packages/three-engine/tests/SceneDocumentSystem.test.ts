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
  type Object3D,
} from 'three';
import {
  createDefaultMaterialComponent,
  createDefaultSceneDocument,
  type SceneNode,
} from '@digital-twin/scene-schema';
import { describe, expect, it, vi } from 'vitest';
import {
  SceneDocumentSystem,
  StaleAssetLoadError,
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
  it('重载文档期间撤销正在加载的新增模型，不允许迟到对象重新挂回画布', async () => {
    const scene = new Scene();
    let resolveInstance!: (object: Object3D) => void;
    const delayedInstance = new Promise<Object3D>((resolve) => {
      resolveInstance = resolve;
    });
    let generation = 0;
    const assets: AssetInstanceProvider = {
      beginGeneration: vi.fn(() => ++generation),
      instantiate: vi.fn(() => delayedInstance),
      release: vi.fn(() => true),
      dispose: vi.fn(),
    };
    const system = new SceneDocumentSystem(scene, assets);
    const empty = createDefaultSceneDocument('project-1', 'scene-1', '场景');
    await system.loadDocument(empty);

    const pendingAdd = system.addNode(
      node('model', { kind: 'model', assetId: 'asset-1' }),
    );
    const reload = system.loadDocument(empty);
    resolveInstance(modelRoot());

    await reload;
    await expect(pendingAdd).rejects.toBeInstanceOf(StaleAssetLoadError);
    expect(system.getObject('model')).toBeUndefined();
  });

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

  it('按源站规则将深层 Mesh 平铺为固定二级并排除业务子树', async () => {
    const scene = new Scene();
    const modelObject = new Group();
    const redundantGroups = new Group();
    redundantGroups.name = '不应展示的包装层';
    const unnamedMesh = new Mesh(
      new BoxGeometry(1, 1, 1),
      new MeshStandardMaterial({ color: '#fff' }),
    );
    const nestedGroup = new Group();
    nestedGroup.name = '不应展示的装配层';
    const namedMesh = new Mesh(
      new BoxGeometry(1, 1, 1),
      new MeshStandardMaterial({ color: '#fff' }),
    );
    namedMesh.name = '支架';
    nestedGroup.add(namedMesh);
    redundantGroups.add(unnamedMesh, nestedGroup);
    modelObject.add(redundantGroups);
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
          objectId: unnamedMesh.uuid,
          targetObjectId: unnamedMesh.uuid,
          partPath: '0/0',
          name: '未命名材质',
          objectType: 'Mesh',
        },
        {
          objectId: namedMesh.uuid,
          targetObjectId: namedMesh.uuid,
          partPath: '0/1/0',
          name: '支架',
          objectType: 'Mesh',
        },
      ],
    });
    expect(system.getModelPartObject('model', namedMesh.uuid)).toBe(namedMesh);
    expect(
      system.getModelPartObject(
        'model',
        system.getObject('business-child')!.uuid,
      ),
    ).toBeUndefined();
  });

  it('按稳定部件路径隐藏模型子网格并在结构列表中移除，撤销快照可恢复', async () => {
    const scene = new Scene();
    const modelObject = new Group();
    const firstMesh = new Mesh(
      new BoxGeometry(1, 1, 1),
      new MeshStandardMaterial({ color: '#fff' }),
    );
    firstMesh.name = '第一部分';
    firstMesh.visible = false;
    const secondMesh = new Mesh(
      new BoxGeometry(1, 1, 1),
      new MeshStandardMaterial({ color: '#999' }),
    );
    secondMesh.name = '第二部分';
    modelObject.add(firstMesh, secondMesh);
    const assets: AssetInstanceProvider = {
      beginGeneration: vi.fn(() => 1),
      instantiate: vi.fn(async () => modelObject.clone()),
      release: vi.fn(() => true),
      dispose: vi.fn(),
    };
    const system = new SceneDocumentSystem(scene, assets);
    const document = createDefaultSceneDocument('project-1', 'scene-1', '场景');
    const model = node('model', {
      kind: 'model',
      assetId: 'asset-1',
      excludedPartPaths: ['1'],
    });
    document.nodes = { model };
    document.rootNodeIds = [model.id];

    await system.loadDocument(document);

    const loaded = system.getObject('model')!;
    expect(loaded.children[0]?.visible).toBe(false);
    expect(loaded.children[1]?.visible).toBe(false);
    expect(system.getModelStructures().model).toHaveLength(1);
    expect(system.getModelStructures().model?.[0]?.partPath).toBe('0');
    expect(
      system.getModelPartObject('model', loaded.children[1]?.uuid ?? ''),
    ).toBeUndefined();

    const restored = structuredClone(model);
    restored.components = [
      { kind: 'model', assetId: 'asset-1', excludedPartPaths: [] },
    ];
    await system.updateNode(restored);
    expect(system.getModelStructures().model).toHaveLength(2);
    expect(system.getObject('model')?.children[0]?.visible).toBe(false);
    expect(system.getObject('model')?.children[1]?.visible).toBe(true);
    system.dispose();
  });

  it('多材质 Mesh 使用材质名称去重但仍解析到所属 Mesh', async () => {
    const scene = new Scene();
    const modelObject = new Group();
    const sharedMaterial = new MeshStandardMaterial({ color: '#fff' });
    sharedMaterial.name = '刀具库框架-材质';
    const unnamedMaterial = new MeshStandardMaterial({ color: '#999' });
    const mesh = new Mesh(new BoxGeometry(1, 1, 1), [
      sharedMaterial,
      unnamedMaterial,
      sharedMaterial,
    ]);
    mesh.name = '多材质外壳';
    modelObject.add(mesh);
    const assets: AssetInstanceProvider = {
      beginGeneration: vi.fn(() => 1),
      instantiate: vi.fn(async () => modelObject),
      release: vi.fn(() => true),
      dispose: vi.fn(),
    };
    const system = new SceneDocumentSystem(scene, assets);
    const document = createDefaultSceneDocument('project-1', 'scene-1', '场景');
    const model = node('model', { kind: 'model', assetId: 'asset-1' });
    document.nodes = { model };
    document.rootNodeIds = [model.id];

    await system.loadDocument(document);

    expect(system.getModelStructures().model).toEqual([
      {
        objectId: sharedMaterial.uuid,
        targetObjectId: mesh.uuid,
        partPath: '0',
        name: '刀具库框架-材质',
        objectType: 'MeshStandardMaterial',
      },
      {
        objectId: unnamedMaterial.uuid,
        targetObjectId: mesh.uuid,
        partPath: '0',
        name: '未命名材质',
        objectType: 'MeshStandardMaterial',
      },
    ]);
    expect(system.getModelPartObject('model', mesh.uuid)).toBe(mesh);
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

  it('异步重载期间保留旧场景，所有新节点就绪后再一次性替换', async () => {
    const scene = new Scene();
    let resolveNext!: (object: Group) => void;
    const nextObject = new Promise<Group>((resolve) => {
      resolveNext = resolve;
    });
    const oldObject = modelRoot();
    oldObject.name = '旧场景';
    const newObject = modelRoot();
    newObject.name = '新场景';
    const assets: AssetInstanceProvider = {
      beginGeneration: vi.fn(() => 1),
      instantiate: vi.fn((assetId: string) =>
        assetId === 'asset-new' ? nextObject : Promise.resolve(oldObject),
      ),
      release: vi.fn(() => true),
      dispose: vi.fn(),
    };
    const system = new SceneDocumentSystem(scene, assets);
    const first = createDefaultSceneDocument('project-1', 'scene-1', '场景');
    const oldNode = node('model', { kind: 'model', assetId: 'asset-old' });
    first.nodes = { model: oldNode };
    first.rootNodeIds = ['model'];
    await system.loadDocument(first);

    const second = structuredClone(first);
    second.nodes.model!.components = [{ kind: 'model', assetId: 'asset-new' }];
    const loading = system.loadDocument(second);
    await Promise.resolve();

    // 新模型仍在解码时，旧模型必须继续可见，避免撤销/重做出现黑屏闪烁。
    expect(system.root.children).toEqual([oldObject]);
    expect(assets.release).not.toHaveBeenCalledWith(oldObject);

    resolveNext(newObject);
    await loading;
    expect(system.root.children).toEqual([newObject]);
    expect(assets.release).toHaveBeenCalledWith(oldObject);
    system.dispose();
  });
});
