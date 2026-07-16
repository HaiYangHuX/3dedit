# 完整场景编辑内核实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将现有 WebGL 骨架扩展为可加载多模型、添加基础元素、选择、变换、编辑层级与属性、撤销重做并保存的真实场景编辑器。

**Architecture:** `editor-core` 只处理可序列化 `SceneDocument` 和命令历史；`three-engine` 通过注入的 AssetResolver 构建并拥有 Object3D、Loader、TransformControls、选择和 GPU 生命周期；Vue 只通过 `EditorCanvas` 桥接 DTO 和事件。场景树、属性面板与视口共享稳定 SceneNode ID，不把 Object3D 放入 Pinia。

**Tech Stack:** Vue 3、Pinia、Element Plus、Three.js `0.183.0`、`@types/three@0.183.1`、GLTF/DRACO/KTX2/FBX/OBJ/STL/USDZ Loader、Vitest、Playwright。

## Global Constraints

- Three.js 与类型声明继续精确锁定 `0.183.0` / `0.183.1`，以运行时 API 为准。
- 所有可撤销编辑必须执行命令，Vue 表单不能直接持久修改 Three.js 对象。
- SceneNode ID 是业务主键，Three.js UUID 不进入场景文档。
- 场景切换使用加载代次；迟到模型必须释放，不能加入新场景。
- 模型、Geometry、Material、Texture、Mixer、Controls、监听器和 RAF 必须有明确所有者与释放路径。
- Composer 是唯一最终渲染路径，pointer 坐标基于 canvas bounding rect。
- 模型加载失败生成可选择的异常占位节点，不阻断其他节点。
- 核心类、并发边界、命令回滚和资源释放使用有效中文注释。

---

### Task 1: 完善文档命令、选择与引用不变量

**Files:**
- Create: `packages/editor-core/src/context/EditorDocumentContext.ts`
- Create: `packages/editor-core/src/commands/RemoveNodesCommand.ts`
- Create: `packages/editor-core/src/commands/UpdateNodeCommand.ts`
- Create: `packages/editor-core/src/commands/TransformNodesCommand.ts`
- Create: `packages/editor-core/src/commands/ReparentNodeCommand.ts`
- Create: `packages/editor-core/src/selection/SelectionModel.ts`
- Modify: `packages/editor-core/src/commands/AddNodeCommand.ts`
- Modify: `packages/editor-core/src/index.ts`
- Create: `packages/editor-core/tests/DocumentCommands.test.ts`
- Create: `packages/editor-core/tests/SelectionModel.test.ts`

**Interfaces:**
- Produces: `EditorDocumentContext { document: SceneDocument; onChanged?(): void }`。
- Produces: `RemoveNodesCommand`、`UpdateNodeCommand`、`TransformNodesCommand`、`ReparentNodeCommand`。
- Produces: `SelectionModel.set(ids, primaryId?)`、`toggle(id)`、`remove(ids)`、`clear()`。

- [ ] **Step 1: 写删除、变换合并、层级和选择失败测试**

```ts
await history.execute(new RemoveNodesCommand(['parent']));
expect(document.nodes.parent).toBeUndefined();
expect(document.nodes.child).toBeUndefined();
expect(document.interactions).not.toContainEqual(expect.objectContaining({ sourceNodeId: 'child' }));
await history.undo();
expect(document.nodes.child?.parentId).toBe('parent');

await history.execute(new TransformNodesCommand([{ id: 'node', before, after: move1 }]));
await history.execute(new TransformNodesCommand([{ id: 'node', before: move1, after: move2 }]));
await history.undo();
expect(document.nodes.node?.transform).toEqual(before);
```

- [ ] **Step 2: 运行测试确认命令缺失**

Run: `pnpm --filter @digital-twin/editor-core test`
Expected: FAIL，模块不存在。

- [ ] **Step 3: 实现原子文档命令**

删除命令保存完整子树、原父子索引、受影响交互和 Socket 任务以供 undo；更新命令保存 before/after patch；变换命令按相同节点集合合并连续操作；层级命令拒绝把节点移动到自身后代。每次命令完成后调用 `onChanged` 一次。

- [ ] **Step 4: 实现无 Vue 依赖选择模型**

`SelectionModel` 使用 `Set<string>` 和主选择 ID；所有公开 getter 返回副本，避免调用方绕过事件；变更只在集合实际变化时触发订阅者。

- [ ] **Step 5: 验证并提交**

Run: `pnpm --filter @digital-twin/editor-core test && pnpm --filter @digital-twin/editor-core typecheck`

```bash
git add packages/editor-core
git commit -m "💥 feat(编辑内核): 完善节点命令与选择模型"
```

---

### Task 2: 建立 r183 多格式 Asset Loader 与实例缓存

**Files:**
- Create: `packages/three-engine/src/assets/types.ts`
- Create: `packages/three-engine/src/assets/AssetLoader.ts`
- Create: `packages/three-engine/src/assets/AssetInstanceSystem.ts`
- Create: `packages/three-engine/src/objects/createPlaceholder.ts`
- Modify: `packages/three-engine/src/ResourceTracker.ts`
- Modify: `packages/three-engine/src/index.ts`
- Create: `packages/three-engine/tests/AssetInstanceSystem.test.ts`
- Create: `packages/three-engine/tests/fixtures/minimalGlb.ts`

**Interfaces:**
- Consumes: `AssetResolver.resolve(assetId): Promise<{ url; format; name }>`。
- Produces: `AssetLoader.load(descriptor, signal): Promise<LoadedAsset>`。
- Produces: `AssetInstanceSystem.instantiate(assetId, generation): Promise<Object3D>`、`release(root)`、`dispose()`。

- [ ] **Step 1: 写缓存、克隆、取消和失败占位测试**

```ts
const first = await system.instantiate('asset-1', 1);
const second = await system.instantiate('asset-1', 1);
expect(first).not.toBe(second);
expect(loader.load).toHaveBeenCalledTimes(1);
generation = 2;
await expect(system.instantiate('late', 1)).rejects.toThrow('过期');
expect(disposeObject).toHaveBeenCalled();
```

- [ ] **Step 2: 运行测试确认 Loader 系统不存在**

Run: `pnpm --filter @digital-twin/three-engine test`
Expected: FAIL。

- [ ] **Step 3: 实现 r183 Loader**

使用 `three/addons/loaders/GLTFLoader.js`、`DRACOLoader.js`、`KTX2Loader.js`、`FBXLoader.js`、`OBJLoader.js`、`STLLoader.js`、`USDZLoader.js` 与 `three/addons/utils/SkeletonUtils.js`。GLTF 保留 `scene/animations`；STL 包装为 Mesh；Loader 不支持 AbortSignal 时由实例系统使用代次丢弃迟到结果。

- [ ] **Step 4: 实现引用缓存和释放**

缓存持有一份模板，实例使用 SkeletonUtils clone；释放实例不销毁模板共享资源，最后一个引用与系统 dispose 才统一释放。错误占位使用 BoxGeometry 与 MeshStandardMaterial 并在 `userData.loadError` 保存原因。

- [ ] **Step 5: 验证并提交**

Run: `pnpm --filter @digital-twin/three-engine test && pnpm --filter @digital-twin/three-engine typecheck`

```bash
git add packages/three-engine
git commit -m "💥 feat(模型加载): 支持多格式资源实例与异步释放"
```

---

### Task 3: 让 EditorEngine 加载和同步 SceneDocument

**Files:**
- Create: `packages/three-engine/src/documents/SceneDocumentSystem.ts`
- Create: `packages/three-engine/src/objects/createSceneObject.ts`
- Create: `packages/three-engine/src/types.ts`
- Modify: `packages/three-engine/src/EditorEngine.ts`
- Modify: `packages/three-engine/src/index.ts`
- Create: `packages/three-engine/tests/SceneDocumentSystem.test.ts`

**Interfaces:**
- Produces: `EditorEngine.loadDocument(document, resolver): Promise<LoadReport>`。
- Produces: `addNode(node)`、`removeNodes(ids)`、`updateNode(node)`、`getObject(nodeId)`、`getStats()`。
- Maintains: `SceneNode ID ↔ Object3D` 双向映射，Object3D `userData.sceneNodeId`。

- [ ] **Step 1: 写多模型、几何体、灯光和场景切换失败测试**

断言两个 model 节点分别解析、box/sphere/plane/cylinder 使用对应 BufferGeometry、五种灯光使用 r183 Light、父子层级一致；第二次 load 后第一次代次对象全部移除并释放。

- [ ] **Step 2: 实现场景对象工厂**

模型委托 AssetInstanceSystem；几何体使用 MeshStandardMaterial；light 组件创建 Ambient/Directional/Hemisphere/Point/SpotLight 并同步 color/intensity/castShadow；generic 组件创建 Group 占位但保留 ID。

- [ ] **Step 3: 实现增量文档同步与统计**

加载先建立全部 Object3D 再连接层级，避免父子顺序依赖；更新 transform 使用弧度；统计遍历 BufferGeometry position/index，重复共享 Geometry 只计一次资源、场景可见面按实例计数。

- [ ] **Step 4: 验证并提交**

Run: `pnpm --filter @digital-twin/three-engine test && pnpm --filter @digital-twin/three-engine typecheck`

```bash
git add packages/three-engine
git commit -m "💥 feat(场景引擎): 加载文档并同步多类型节点"
```

---

### Task 4: 接入选择、TransformControls、拖放定位和相机工具

**Files:**
- Create: `packages/three-engine/src/interaction/SelectionSystem.ts`
- Create: `packages/three-engine/src/interaction/TransformSystem.ts`
- Create: `packages/three-engine/src/interaction/ViewportDropSystem.ts`
- Modify: `packages/three-engine/src/EditorEngine.ts`
- Create: `packages/three-engine/tests/SelectionSystem.test.ts`
- Modify: `apps/editor-web/src/components/EditorCanvas.vue`
- Create: `apps/editor-web/tests/EditorCanvasBridge.test.ts`

**Interfaces:**
- Produces engine events: `selectionchange(ids, primaryId)`、`transformstart`、`transformchange`、`transformend(before, after)`、`statschange`。
- Produces bridge methods: `loadDocument`、`applyNodeAdded/Removed/Updated`、`setSelection`、`setTransformMode`、`setTransformSpace`、`focusSelection`。
- Emits Vue events: `select`、`transform-commit`、`asset-drop`。

- [ ] **Step 1: 写 canvas-relative raycast 和 transform 快照测试**

Pointer NDC 必须使用 renderer canvas rect；命中子 mesh 上溯到含 `sceneNodeId` 的业务根；TransformControls mouseDown 保存 before、mouseUp 只提交一次 after；locked 节点不能 attach。

- [ ] **Step 2: 实现 SelectionSystem 与 OutlinePass 同步**

点击、Cmd/Ctrl 多选和空白清空；dragging OrbitControls 时不触发点击；`OutlinePass.selectedObjects` 只包含业务根。

- [ ] **Step 3: 实现 TransformSystem 与 drop 平面**

W/E/R 切模式，local/world 切空间；拖放位置取相机射线与 y=0 平面交点，无交点时用相机前方固定距离；位置支持网格吸附。

- [ ] **Step 4: 实现 Vue 桥接生命周期**

`EditorCanvas` 使用单个 engine，watch document 身份后 load；使用 `defineExpose` 暴露命令同步方法；组件卸载先使加载代次失效，再 dispose。

- [ ] **Step 5: 验证并提交**

Run: `pnpm --filter @digital-twin/three-engine test && pnpm --filter @digital-twin/editor-web test && pnpm typecheck`

```bash
git add packages/three-engine apps/editor-web/src/components apps/editor-web/tests
git commit -m "💥 feat(视口交互): 接入选择变换与模型拖放定位"
```

---

### Task 5: 整合 Document Store 历史、快捷键和资源添加

**Files:**
- Create: `apps/editor-web/src/stores/selection.ts`
- Create: `apps/editor-web/src/editor/createSceneNode.ts`
- Create: `apps/editor-web/src/editor/useEditorCommands.ts`
- Modify: `apps/editor-web/src/stores/document.ts`
- Modify: `apps/editor-web/src/views/EditorWorkspace.vue`
- Create: `apps/editor-web/tests/editorCommands.test.ts`

**Interfaces:**
- Produces: `documentStore.execute(command)`、`undo()`、`redo()`、`canUndo/canRedo`、`markSaved()`。
- Produces: `addAssetNode(asset, position)`、`addGeometry(primitive)`、`addLight(type)`、`removeSelection()`、`updateSelection(patch)`。

- [ ] **Step 1: 写命令后 dirty、保存 clean、撤销与资源引用测试**

```ts
await store.execute(new AddNodeCommand(modelNode));
expect(store.saveState).toBe('dirty');
expect(store.document.assetReferences).toEqual([{ assetId, nodeIds: [modelNode.id] }]);
await store.undo();
expect(store.document.nodes[modelNode.id]).toBeUndefined();
```

- [ ] **Step 2: 实现历史与保存状态集成**

每次 load 创建新 CommandHistory；保存成功 `markSaved`；历史命令修改当前文档后重建 assetReferences 并触发自动保存。保存期间 undo/redo 仍使用 changeGeneration 防覆盖。

- [ ] **Step 3: 实现快捷键和节点工厂**

Cmd/Ctrl+Z、Shift+Cmd/Ctrl+Z、Delete、W/E/R/F；输入框、textarea、contenteditable 聚焦时不拦截。节点工厂产生稳定 UUID、默认 transform、components 和 businessData。

- [ ] **Step 4: 验证并提交**

Run: `pnpm --filter @digital-twin/editor-web test && pnpm --filter @digital-twin/editor-web typecheck`

```bash
git add apps/editor-web
git commit -m "💥 feat(编辑命令): 整合场景历史快捷键与资源添加"
```

---

### Task 6: 实现场景树和属性检查器

**Files:**
- Create: `apps/editor-web/src/components/editor/SceneTree.vue`
- Create: `apps/editor-web/src/components/editor/TransformInspector.vue`
- Create: `apps/editor-web/src/components/editor/NodeInspector.vue`
- Create: `apps/editor-web/src/components/editor/SceneSettingsInspector.vue`
- Modify: `apps/editor-web/src/views/EditorWorkspace.vue`
- Modify: `apps/editor-web/src/styles/editor.scss`
- Create: `apps/editor-web/tests/SceneTree.test.ts`
- Create: `apps/editor-web/tests/TransformInspector.test.ts`

**Interfaces:**
- SceneTree emits `select`、`toggle-visible`、`toggle-locked`、`rename`、`remove`、`reparent`。
- Inspector emits command-friendly before/after values，不直接修改 store document。

- [ ] **Step 1: 写树形层级、搜索、选择和 transform 提交测试**

断言父子节点按 childIds 顺序；搜索保留祖先；点击与 selectionStore 双向同步；Number input change 只发一次 `commit`；统一缩放保持三个轴相等。

- [ ] **Step 2: 实现场景树**

使用 Element Plus Tree，自定义节点显示显隐、锁定和加载异常；拖拽前调用 editor-core 环检测；右键/按钮支持重命名、复制、分组和删除。

- [ ] **Step 3: 实现动态属性检查器**

基础属性、position/rotation degree/scale、geometry primitive、light color/intensity/castShadow、模型 asset 信息、businessData JSON；连续输入在 blur/change 时提交命令。

- [ ] **Step 4: 实现场景设置**

背景色、曝光、网格显示、environmentAssetId 使用文档命令；引擎同步 Scene background、toneMappingExposure 和 GridHelper。

- [ ] **Step 5: 验证并提交**

Run: `pnpm --filter @digital-twin/editor-web test && pnpm --filter @digital-twin/editor-web build && pnpm lint`

```bash
git add apps/editor-web packages/three-engine
git commit -m "🌷 UI(场景编辑器): 完成场景树与属性检查器"
```

---

### Task 7: 真实 Chromium 多模型编辑保存验收

**Files:**
- Create: `tests/e2e/scene-editing.spec.ts`
- Modify: `tests/e2e/asset-upload.spec.ts`
- Modify: `README.md`

**Interfaces:**
- Verifies: 上传 GLB → 双击/拖入两次 → 选择 → 变换 → 添加灯光 → 撤销重做 → 保存 → 重载文档与 WebGL 对象一致。

- [ ] **Step 1: 写多模型编辑失败测试**

使用真实 PostgreSQL/MinIO/Redis/API/Worker/Chromium；通过资源专用 drag MIME 将同一资源添加两次，断言场景树两个稳定节点；修改位置和灯光强度后保存；刷新后 canvas 业务对象数和 API 文档一致。

- [ ] **Step 2: 增加引擎可观测测试属性**

仅暴露 `data-engine-ready`、`data-scene-object-count` 和状态栏统计，不把测试方法写入生产引擎。

- [ ] **Step 3: 执行完整验证**

Run:

```bash
E2E_DATABASE=true pnpm exec playwright test tests/e2e/scene-editing.spec.ts
pnpm verify
git diff --check
```

- [ ] **Step 4: 提交验收**

```bash
git add tests/e2e README.md apps/editor-web
git commit -m "✅ tests(场景编辑器): 验证多模型编辑与保存闭环"
```

## Completion Gate

1. 同一场景可加载和实例化多个模型以及基础几何体/五种灯光。
2. 场景树、视口选择和属性面板通过 SceneNode ID 双向同步。
3. TransformControls、拖放定位、快捷键、撤销重做与保存状态工作一致。
4. 场景切换取消迟到模型并释放旧 Object3D/GPU 资源。
5. 真实 Chromium 完成上传、添加两个模型、变换、保存和刷新还原。
6. Three.js 继续精确为 `0.183.0`，单元、类型、构建与 E2E 全部通过。
