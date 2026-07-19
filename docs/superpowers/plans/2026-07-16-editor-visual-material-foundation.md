# 编辑器视觉布局与 PBR 材质基础实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将当前编辑器升级为接近 数字孪生 密度的 33/180/340 工作台，并交付可保存、撤销、预览和发布的节点级 PBR 材质覆盖系统。

**Architecture:** `scene-schema` 定义稳定材质协议和统一资源引用收集器；`three-engine` 的 `MaterialSystem` 独占覆盖材质、贴图 clone 和异步代次，编辑器与运行时共享同一投影逻辑；Vue 通过 `EditorCanvas` DTO 桥接相机、截图和统计，不持有 Three.js 对象。视觉层拆为小型工具栏、统计与方向方块组件，`EditorWorkspace` 只编排状态和命令。

**Tech Stack:** Vue 3.5、TypeScript 5.9、Pinia 4、Element Plus 2.14、Three.js `0.183.0`、`@types/three@0.183.1`、Zod、Vitest、Vue Test Utils、Playwright。

## Global Constraints

- Three.js 与类型声明精确锁定 `0.183.0` / `0.183.1`，实际 runtime API 是最终权威。
- Addon 使用 `three/addons/...`，颜色管理使用 `outputColorSpace`、`SRGBColorSpace` 与 `NoColorSpace`。
- Composer 是主场景唯一最终渲染路径；方向方块不能创建第二个 WebGLRenderer。
- 所有可保存材质编辑必须执行 `UpdateNodeCommand`，不能直接修改 Pinia 文档或 Three.js Material。
- Material、Texture、Loader、相机动画、截图回调、监听器和 RAF 必须有明确所有者和幂等释放路径。
- 场景切换和连续材质更新都使用异步代次；迟到 Texture 不得进入当前节点。
- 模型模板原始材质和贴图属于 AssetInstanceSystem，MaterialSystem 只能恢复引用，不能释放共享资源。
- 核心类、异步边界、资源所有权和非显然 UI 行为使用有效中文注释。
- 不修改旧 React/Koa 项目，不增加登录、权限、多租户、业务历史版本或本周期以外的高级编辑器功能。

---

## 文件结构

### 新建

- `packages/scene-schema/src/material.ts`：材质 Zod 协议、类型和默认值工厂。
- `packages/scene-schema/src/assetReferences.ts`：从真实组件统一收集模型、环境与贴图引用。
- `packages/three-engine/src/materials/MaterialSystem.ts`：r183 材质和贴图生命周期。
- `packages/three-engine/src/interaction/ViewportCameraSystem.ts`：相机六视图、重置与短动画。
- `packages/three-engine/tests/MaterialSystem.test.ts`：材质映射、贴图、代次与释放测试。
- `packages/three-engine/tests/ViewportCameraSystem.test.ts`：相机方向与动画测试。
- `apps/editor-web/src/components/editor/MaterialInspector.vue`：节点级材质编辑器。
- `apps/editor-web/src/components/editor/EditorTopBar.vue`：高密度顶栏。
- `apps/editor-web/src/components/editor/AssetPalette.vue`：左侧竖向分类壳。
- `apps/editor-web/src/components/editor/ViewportToolbar.vue`：视口操作工具条。
- `apps/editor-web/src/components/editor/ViewportGizmo.vue`：纯 DOM/CSS 方向方块。
- `apps/editor-web/src/components/editor/ViewportStats.vue`：视口统计浮层。
- `apps/editor-web/tests/MaterialInspector.test.ts`：材质表单协议测试。
- `apps/editor-web/tests/ViewportChrome.test.ts`：工具栏、Gizmo 与统计组件测试。

### 修改

- `packages/scene-schema/src/schema.ts`、`index.ts`、`tests/sceneDocument.test.ts`
- `packages/three-engine/src/assets/types.ts`、`documents/SceneDocumentSystem.ts`、`EditorEngine.ts`、`RuntimeThreeEngine.ts`、`types.ts`、`index.ts`
- `packages/three-engine/tests/SceneDocumentSystem.test.ts`
- `apps/api-server/src/scenes/scene-document.ts`、`publications/publication.service.ts`
- `apps/api-server/tests/scene-document.test.ts`、`publication.service.test.ts`
- `apps/editor-web/src/three/editorAssetResolver.ts`、`components/EditorCanvas.vue`、`components/editor/NodeInspector.vue`、`editor/createSceneNode.ts`、`editor/useEditorCommands.ts`、`views/EditorWorkspace.vue`、`styles/editor.scss`
- `apps/editor-web/tests/EditorCanvasBridge.test.ts`、`EditorWorkspace.test.ts`、`editorCommands.test.ts`、`editorAssetResolver.test.ts`
- `apps/runtime-web/src/runtime/runtimeAssetResolver.ts`、对应 resolver 测试
- `README.md`、`tests/e2e/editor.spec.ts`

---

### Task 1: 建立强类型材质协议与真实资源引用

**Files:**
- Create: `packages/scene-schema/src/material.ts`
- Create: `packages/scene-schema/src/assetReferences.ts`
- Modify: `packages/scene-schema/src/schema.ts`
- Modify: `packages/scene-schema/src/index.ts`
- Modify: `packages/scene-schema/tests/sceneDocument.test.ts`
- Modify: `apps/api-server/src/scenes/scene-document.ts`
- Modify: `apps/api-server/tests/scene-document.test.ts`

**Interfaces:**
- Produces: `materialComponentSchema`、`materialTextureBindingSchema`。
- Produces: `MaterialComponent`、`MaterialTextureBinding`、`MaterialTextureSlot`。
- Produces: `createDefaultMaterialComponent(): MaterialComponent`。
- Produces: `collectAssetReferences(document: SceneDocument): AssetReference[]`。

- [ ] **Step 1: 写失败协议测试**

```ts
const material = createDefaultMaterialComponent();
material.materialType = 'physical';
material.clearcoat = 0.8;
material.textures.baseColor = {
  assetId: 'texture-color',
  offset: [0, 0],
  repeat: [2, 2],
  rotation: 0,
  wrapS: 'repeat',
  wrapT: 'repeat',
};
node.components.push(material);
expect(sceneDocumentSchema.safeParse(document).success).toBe(true);

material.opacity = 1.2;
expect(sceneDocumentSchema.safeParse(document).success).toBe(false);
```

并在服务端测试中断言 model、environment 和两个去重贴图都进入 `assetReferences`，贴图引用携带所在 nodeId。

- [ ] **Step 2: 运行测试确认协议尚不支持 material**

Run:

```bash
pnpm --filter @digital-twin/scene-schema test
pnpm --filter @digital-twin/api-server test -- scene-document.test.ts
```

Expected: FAIL，`createDefaultMaterialComponent` 或 material discriminator 不存在。

- [ ] **Step 3: 实现材质 Schema 与默认工厂**

`material.ts` 使用闭区间校验：opacity/roughness/metalness/clearcoat/clearcoatRoughness/reflectivity 为 0..1，emissiveIntensity/envMapIntensity/shininess/aoMapIntensity 非负，repeat 每轴非零。默认值为 Standard 灰白材质、roughness 0.72、metalness 0.08、双面关闭、阴影关闭、所有贴图为 null。

在 `schema.ts` 的 discriminated union 中直接加入 `materialComponentSchema`，不再把 material 归入宽泛 data 组件。

- [ ] **Step 4: 实现唯一资源引用收集器**

```ts
export function collectAssetReferences(document: SceneDocument): AssetReference[] {
  const references = new Map<string, Set<string>>();
  // model 与每个非空 material texture 记录 nodeId；environment 记录空 nodeIds。
  return [...references].sort(([a], [b]) => a.localeCompare(b)).map(...);
}
```

`normalizeSceneDocument` 删除本地重复遍历，改用该函数，确保删除保护和发布使用同一事实来源。

- [ ] **Step 5: 验证并提交**

Run:

```bash
pnpm --filter @digital-twin/scene-schema test
pnpm --filter @digital-twin/scene-schema typecheck
pnpm --filter @digital-twin/api-server test -- scene-document.test.ts
```

Expected: PASS。

```bash
git add packages/scene-schema apps/api-server/src/scenes apps/api-server/tests/scene-document.test.ts
git commit -m "💥 feat(材质协议): 定义PBR组件与资源引用"
```

---

### Task 2: 以 TDD 实现 r183 MaterialSystem

**Files:**
- Create: `packages/three-engine/src/materials/MaterialSystem.ts`
- Create: `packages/three-engine/tests/MaterialSystem.test.ts`
- Modify: `packages/three-engine/src/assets/types.ts`
- Modify: `packages/three-engine/src/index.ts`

**Interfaces:**
- Consumes: `AssetResolver.resolve(assetId): Promise<AssetDescriptor>`，descriptor 允许模型、HDR 和 PNG/JPG/JPEG/WebP。
- Produces: `MaterialSystem.beginGeneration(): number`。
- Produces: `MaterialSystem.apply(root, component, generation): Promise<MaterialApplyReport>`。
- Produces: `MaterialSystem.restore(root): void`、`dispose(): void`。
- Produces: `StaleMaterialLoadError`。

- [ ] **Step 1: 写材质映射与恢复失败测试**

```ts
const mesh = new Mesh(new BoxGeometry(), originalMaterial);
await system.apply(mesh, physicalComponent, system.beginGeneration());
expect(mesh.material).toBeInstanceOf(MeshPhysicalMaterial);
expect((mesh.material as MeshPhysicalMaterial).clearcoat).toBe(0.8);
expect(mesh.castShadow).toBe(true);
system.restore(mesh);
expect(mesh.material).toBe(originalMaterial);
expect(originalMaterial.dispose).not.toHaveBeenCalled();
```

覆盖 Standard/Physical/Phong/Basic、Material array、side、透明、发光、阴影与重复 restore。

- [ ] **Step 2: 写贴图颜色空间、UV 和过期结果测试**

注入 `TextureLoaderLike`，手动控制 Promise：Base Color/Emissive 断言 `SRGBColorSpace`，Normal/Roughness/Metalness/AO 断言 `NoColorSpace`，offset/repeat/rotation/wrap 正确。调用新 generation 后再 resolve 旧 Promise，断言结果被 dispose 且未赋给 Mesh。

- [ ] **Step 3: 运行测试确认 MaterialSystem 不存在**

Run: `pnpm --filter @digital-twin/three-engine test -- MaterialSystem.test.ts`

Expected: FAIL，模块不存在。

- [ ] **Step 4: 实现材质与贴图生命周期**

使用 r183 `MeshStandardMaterial`、`MeshPhysicalMaterial`、`MeshPhongMaterial`、`MeshBasicMaterial`、`TextureLoader`、`FrontSide`/`BackSide`/`DoubleSide`、`RepeatWrapping`/`ClampToEdgeWrapping`/`MirroredRepeatWrapping`。贴图模板按 assetId 缓存，绑定使用 clone；同一节点共享一份覆盖 Material，restore 顺序为先恢复 Mesh 引用、后释放覆盖资源。

对每次 apply 生成 node token；JSON key 未改变时直接返回。贴图单槽失败写入 report，不抛出阻断其他槽；generation 过期抛 `StaleMaterialLoadError` 并释放已经创建的 clone。

- [ ] **Step 5: 验证并提交**

Run:

```bash
pnpm --filter @digital-twin/three-engine test -- MaterialSystem.test.ts
pnpm --filter @digital-twin/three-engine typecheck
```

Expected: PASS。

```bash
git add packages/three-engine/src/materials packages/three-engine/src/assets/types.ts packages/three-engine/src/index.ts packages/three-engine/tests/MaterialSystem.test.ts
git commit -m "💥 feat(Three材质): 实现PBR覆盖与贴图生命周期"
```

---

### Task 3: 把材质接入文档、编辑器、运行时与发布包

**Files:**
- Modify: `packages/three-engine/src/documents/SceneDocumentSystem.ts`
- Modify: `packages/three-engine/src/EditorEngine.ts`
- Modify: `packages/three-engine/src/RuntimeThreeEngine.ts`
- Modify: `packages/three-engine/tests/SceneDocumentSystem.test.ts`
- Modify: `apps/editor-web/src/three/editorAssetResolver.ts`
- Modify: `apps/editor-web/tests/editorAssetResolver.test.ts`
- Modify: `apps/runtime-web/src/runtime/runtimeAssetResolver.ts`
- Modify: `apps/runtime-web/tests/runtimeAssetResolver.test.ts`
- Modify: `apps/api-server/src/publications/publication.service.ts`
- Modify: `apps/api-server/tests/publication.service.test.ts`

**Interfaces:**
- `SceneDocumentSystem(scene, assets, materials?)` 在节点 create/update/replace/remove/dispose 对称调用材质系统。
- Editor preview resolver 与 Runtime resolver 都返回图片 descriptor。
- 发布集合直接使用 `collectAssetReferences(document)`。

- [ ] **Step 1: 写集成失败测试**

```ts
expect(materials.apply).toHaveBeenCalledWith(
  expect.any(Object3D),
  expect.objectContaining({ kind: 'material' }),
  expect.any(Number),
);
system.removeNodes(['node']);
expect(materials.restore).toHaveBeenCalled();
```

Resolver 测试加入 ready PNG；发布测试让 material 引用 `texture-1`，断言 MinIO 同时复制 GLB 和 PNG。

- [ ] **Step 2: 运行窄测试确认失败**

Run:

```bash
pnpm --filter @digital-twin/three-engine test -- SceneDocumentSystem.test.ts
pnpm --filter @digital-twin/editor-web test -- editorAssetResolver.test.ts
pnpm --filter @digital-twin/runtime-web test -- runtimeAssetResolver.test.ts
pnpm --filter @digital-twin/api-server test -- publication.service.test.ts
```

Expected: FAIL，图片被 resolver 拒绝或材质未调用。

- [ ] **Step 3: 接入统一 MaterialSystem**

Engine 每次创建 SceneDocumentSystem 时使用同一个 resolver 构造 MaterialSystem。节点材质错误并入 `LoadReport.errors`，但不进入 placeholderNodeIds。移除/替换时必须在 AssetInstanceSystem.release 之前 restore。

- [ ] **Step 4: 扩展 resolver 和发布收集**

`EngineAssetFormat` 增加四种图片格式；模型 Loader 对图片 descriptor 明确报错，MaterialSystem 只读取 URL。编辑器、草稿预览、正式发布 Resolver 都接受 PNG/JPG/JPEG/WebP。PublicationService 通过统一引用收集器查询和复制资源。

- [ ] **Step 5: 验证并提交**

Run: 重复 Step 2 命令并追加四个 package 的 typecheck，Expected: PASS。

```bash
git add packages/three-engine apps/editor-web/src/three apps/editor-web/tests/editorAssetResolver.test.ts apps/runtime-web apps/api-server/src/publications apps/api-server/tests/publication.service.test.ts
git commit -m "💥 feat(材质运行时): 打通预览发布贴图闭环"
```

---

### Task 4: 实现相机导航、截图与限频渲染统计

**Files:**
- Create: `packages/three-engine/src/interaction/ViewportCameraSystem.ts`
- Create: `packages/three-engine/tests/ViewportCameraSystem.test.ts`
- Modify: `packages/three-engine/src/types.ts`
- Modify: `packages/three-engine/src/EditorEngine.ts`
- Modify: `packages/three-engine/src/index.ts`
- Modify: `apps/editor-web/src/components/EditorCanvas.vue`
- Modify: `apps/editor-web/tests/EditorCanvasBridge.test.ts`
- Modify: `apps/editor-web/src/editor/useEditorCommands.ts`

**Interfaces:**
- Produces: `CameraView = 'front' | 'back' | 'left' | 'right' | 'top' | 'bottom'`。
- Produces: `CameraOrientation { quaternion: [number, number, number, number] }`。
- Produces: `RenderStats { fps: number; drawCalls: number }`。
- EditorCanvas bridge: `setCameraView(view)`、`resetCamera()`、`captureScreenshot(): Promise<Blob>`。
- EditorCanvas emits: `camera-change`、`render-stats-change`。

- [ ] **Step 1: 写相机系统失败测试**

```ts
system.setView('top');
for (let index = 0; index < 20; index += 1) system.update(1 / 60);
expect(camera.position.y).toBeGreaterThan(target.y);
expect(controls.target.toArray()).toEqual(target.toArray());
system.reset();
// 更新到结束后回到构造时保存的默认 position/target。
```

覆盖六方向、相同位置零半径回退、reset、过渡完成和 cancel。

- [ ] **Step 2: 运行测试确认系统不存在**

Run: `pnpm --filter @digital-twin/three-engine test -- ViewportCameraSystem.test.ts`

Expected: FAIL。

- [ ] **Step 3: 实现相机系统并接入 Engine RAF**

视图切换保持当前 target 和 camera-target 距离，使用 220ms ease-out 插值 position/target，OrbitControls 负责最终 lookAt。Engine 在 controls change 和动画帧发出序列化 quaternion；每约 500ms 发出一次 RenderStats，避免 Vue 每帧响应。

- [ ] **Step 4: 实现截图 Promise 与 Vue 桥接**

`captureScreenshot` 把 resolver 入队并 invalidate；Composer 渲染后当帧调用 canvas `toBlob('image/png')`，同帧请求共享 Blob。dispose 时拒绝未完成请求。EditorCanvas 只转发 DTO/Blob，不暴露 renderer 或 camera。

- [ ] **Step 5: 验证并提交**

Run:

```bash
pnpm --filter @digital-twin/three-engine test -- ViewportCameraSystem.test.ts
pnpm --filter @digital-twin/editor-web test -- EditorCanvasBridge.test.ts editorCommands.test.ts
pnpm --filter @digital-twin/three-engine typecheck
pnpm --filter @digital-twin/editor-web typecheck
```

Expected: PASS。

```bash
git add packages/three-engine apps/editor-web/src/components/EditorCanvas.vue apps/editor-web/src/editor/useEditorCommands.ts apps/editor-web/tests/EditorCanvasBridge.test.ts apps/editor-web/tests/editorCommands.test.ts
git commit -m "💥 feat(视口相机): 增加方向导航截图与统计"
```

---

### Task 5: 建立可撤销材质检查器

**Files:**
- Create: `apps/editor-web/src/components/editor/MaterialInspector.vue`
- Create: `apps/editor-web/tests/MaterialInspector.test.ts`
- Modify: `apps/editor-web/src/components/editor/NodeInspector.vue`
- Modify: `apps/editor-web/src/editor/createSceneNode.ts`

**Interfaces:**
- MaterialInspector props: `component?: MaterialComponent`、`disabled: boolean`、`textureAssets: Asset[]`。
- Emits: `update(component: MaterialComponent)`、`restore()`。
- NodeInspector props 新增 `textureAssets: Asset[]`，仍只 emit `EditableNodePatch`。

- [ ] **Step 1: 写表单失败测试**

```ts
await wrapper.get('[data-testid="enable-material"]').trigger('click');
expect(wrapper.emitted('update')?.at(-1)?.[0]).toMatchObject({
  kind: 'material',
  materialType: 'standard',
});
await wrapper.get('[data-testid="material-type"]').setValue('physical');
expect(wrapper.emitted('update')?.at(-1)?.[0]).toMatchObject({
  materialType: 'physical',
});
```

覆盖透明、side、PBR 参数、贴图选择、UV 修改、清除槽和 restore。

- [ ] **Step 2: 运行测试确认组件不存在**

Run: `pnpm --filter @digital-twin/editor-web test -- MaterialInspector.test.ts`

Expected: FAIL。

- [ ] **Step 3: 实现分区材质面板**

面板按“基础、PBR、阴影、贴图”折叠分区呈现。所有编辑先 `structuredClone` 当前 component，再更新字段并 emit 完整对象；没有 component 时按钮 emit 默认工厂结果。不同 materialType 只隐藏不适用参数，不删除字段，切换类型后可恢复原值。

贴图选择只列 ready image/texture，槽展开后显示 offset/repeat/rotation/wrap；绑定新资源使用默认 UV。恢复操作 emit 事件并由 NodeInspector 删除 material component。

- [ ] **Step 4: 让基础几何体带显式默认材质**

`createGeometryNode` 添加默认 material component；模型节点默认保留资源原材质，用户点击启用覆盖。NodeInspector clone components 后新增、替换或删除唯一 material component，继续通过上层 `UpdateNodeCommand` 提交。

- [ ] **Step 5: 验证并提交**

Run:

```bash
pnpm --filter @digital-twin/editor-web test -- MaterialInspector.test.ts EditorWorkspace.test.ts
pnpm --filter @digital-twin/editor-web typecheck
```

Expected: PASS。

```bash
git add apps/editor-web/src/components/editor/MaterialInspector.vue apps/editor-web/src/components/editor/NodeInspector.vue apps/editor-web/src/editor/createSceneNode.ts apps/editor-web/tests/MaterialInspector.test.ts
git commit -m "🌷 UI(材质面板): 支持PBR参数贴图与恢复"
```

---

### Task 6: 重组 数字孪生 风格编辑器工作台

**Files:**
- Create: `apps/editor-web/src/components/editor/EditorTopBar.vue`
- Create: `apps/editor-web/src/components/editor/AssetPalette.vue`
- Create: `apps/editor-web/src/components/editor/ViewportToolbar.vue`
- Create: `apps/editor-web/src/components/editor/ViewportGizmo.vue`
- Create: `apps/editor-web/src/components/editor/ViewportStats.vue`
- Create: `apps/editor-web/tests/ViewportChrome.test.ts`
- Modify: `apps/editor-web/src/views/EditorWorkspace.vue`
- Modify: `apps/editor-web/src/styles/editor.scss`
- Modify: `apps/editor-web/tests/EditorWorkspace.test.ts`

**Interfaces:**
- TopBar 只接收 name/save state/button disabled/loading 并 emit 操作。
- ViewportToolbar 接收 `mode`、`space`、`gridVisible`、`isFullscreen` 并 emit 工具意图。
- ViewportGizmo 接收 quaternion tuple 并 emit `view(CameraView)`。
- ViewportStats 接收 SceneStats 与 RenderStats。

- [ ] **Step 1: 写工作台结构失败测试**

断言：分类按钮为竖向轨道、工具按钮具有 active state、space 可切换、Gizmo 六方向 emit、统计不再占用 footer grid row、截图和重置事件到达 canvas mock。

- [ ] **Step 2: 运行测试确认新组件不存在**

Run:

```bash
pnpm --filter @digital-twin/editor-web test -- ViewportChrome.test.ts EditorWorkspace.test.ts
```

Expected: FAIL。

- [ ] **Step 3: 拆分纯展示组件并重组 Workspace**

`EditorWorkspace` 保持业务方法，只新增 `transformMode`、`transformSpace`、`cameraOrientation`、`renderStats` 和 Fullscreen 状态。截图 Blob 使用 object URL 下载后立即 revoke；fullscreenchange 监听在卸载时移除。资产 store 的 ready image/texture 作为 MaterialInspector props 传递。

- [ ] **Step 4: 实现 33/180/340 高密度样式**

```scss
.editor-workspace {
  grid-template-columns: 180px minmax(0, 1fr) 340px;
  grid-template-rows: 33px minmax(0, 1fr);
}

.asset-panel {
  display: grid;
  grid-template-columns: 60px minmax(0, 1fr);
}
```

顶栏/面板/卡片使用规格颜色；Element Plus small button 高度压到 24px；右侧 tabs 32px；视口工具条约 36px；统计和 Gizmo absolute overlay。720px 高度下所有面板自身滚动，body 不滚动。

- [ ] **Step 5: 验证并提交**

Run:

```bash
pnpm --filter @digital-twin/editor-web test -- ViewportChrome.test.ts EditorWorkspace.test.ts
pnpm --filter @digital-twin/editor-web typecheck
pnpm lint
```

Expected: PASS。

```bash
git add apps/editor-web/src/components/editor apps/editor-web/src/views/EditorWorkspace.vue apps/editor-web/src/styles/editor.scss apps/editor-web/tests
git commit -m "🌷 UI(编辑器工作台): 对标数字孪生高密度布局"
```

---

### Task 7: 浏览器闭环、性能预算与交付文档

**Files:**
- Modify: `tests/e2e/editor.spec.ts`
- Modify: `README.md`

**Interfaces:**
- E2E 使用现有项目/场景/API fixture，不引入只在测试可用的生产开关。
- 视觉证据保存到 Playwright test-results，不提交随机截图。

- [ ] **Step 1: 增加材质与视口 E2E**

流程：打开编辑器 → 添加两个立方体 → 选中第一个 → 改为 Physical/颜色/粗糙度 → 验证另一节点协议未变 → 撤销/重做 → 保存并刷新 → 六方向切换 → 重置 → 截图下载。数据库环境可用时再发布并打开 runtime，验证 scene document 包含 material 且 runtime mesh 可见。

- [ ] **Step 2: 运行单应用与完整验证**

Run:

```bash
pnpm --filter @digital-twin/editor-web test
pnpm --filter @digital-twin/three-engine test
pnpm typecheck
pnpm build
pnpm test:e2e
pnpm verify
git diff --check
```

Expected: 全部 PASS；无 skipped 之外的新失败。

- [ ] **Step 3: Chromium 视觉与交互验收**

使用 1280×720：读取 DOM bounding boxes 确认 top≈33、left≈180、right≈340；截图检查工具条无遮挡、右侧表单无水平溢出、Gizmo/统计均在视口内。执行材质、相机、截图、全屏，并检查 console error 与 failed network requests 为 0。

- [ ] **Step 4: 检查构建预算与资源释放**

记录 editor/runtime 主 chunk 大小；runtime JS 继续控制在首期约 1.2MB 预算附近。重复进入/离开 editor 和 preview，确认 canvas 数量回到 0/1、监听器不重复、无 WebGL context 泄漏提示。

- [ ] **Step 5: 更新 README 并提交**

README 增加材质支持、视口快捷键、截图/全屏、贴图发布和 r183 生命周期说明，同时明确节点级覆盖暂不支持子网格分别配置。

```bash
git add tests/e2e/editor.spec.ts README.md
git commit -m "✅ tests(材质视口): 验证编辑发布与视觉闭环"
```

最后运行 `git status --short`，Expected: 空输出。
