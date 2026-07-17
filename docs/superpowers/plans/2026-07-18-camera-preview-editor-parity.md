# Camera、漫游、拾取与预览还原实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 完成 Camera 配置、漫游编制与播放、流畅模型拾取、真实 Viewport Gizmo、检查器分区滚动及完整草稿预览。

**Architecture:** `SceneDocument` 保存稳定 Camera/路径 DTO，editor-core 命令负责撤销与脏状态；共享 `CameraRoamingSystem` 负责 Three 绘制、播放和资源生命周期；EditorEngine 与 RuntimeThreeEngine 只提供宿主桥接。Vue 编辑器和 Runtime 分别消费引擎事件，Runtime 不引入 Element Plus。

**Tech Stack:** Vue 3.5.40、TypeScript 5.9.3、Pinia、Element Plus 2.14.3、Three.js 0.183.0、three-viewport-gizmo 2.2.0、Vitest 4.1.10、Playwright 1.61.1。

## Global Constraints

- Three.js 固定 `0.183.0`，所有插件 API 以安装后的运行时和类型为准。
- Camera 默认值严格为 `45 / 0.05 / 20000`、`[0.607, 3.347, 7.966]`、`[-0.304, 0.048, 0.016]`、target `[0, 0.5, 0]`。
- 漫游速度 `4`、眼高 `2`、最短段 `400ms`、点击 `250ms/5px`、末段 `20%` 平滑转向。
- Preview 与 Publication 继续使用服务端 SceneDocument/Manifest，不引入 IndexedDB。
- 新增非显然逻辑必须使用简洁中文注释，所有监听和 GPU 资源必须对称释放。

---

### Task 1：拾取、Gizmo 与面板基础体验

**Files:**
- Modify: `packages/three-engine/src/interaction/SelectionSystem.ts`
- Create: `packages/three-engine/src/interaction/ViewportGizmoSystem.ts`
- Modify: `packages/three-engine/src/EditorEngine.ts`
- Modify: `apps/editor-web/src/components/AssetLibraryPanel.vue`
- Modify: `apps/editor-web/src/styles/editor.scss`
- Test: `packages/three-engine/tests/SelectionSystem.test.ts`
- Test: `packages/three-engine/tests/ViewportGizmoSystem.test.ts`

- [x] RED：增加 `5px` 点击、Orbit change 不否决、Mesh 高亮和去重 BoxHelper 测试。
- [x] GREEN：拾取返回业务 ID 与命中 Mesh，整模开关只改变高亮目标。
- [x] GREEN：接入 `three-viewport-gizmo@2.2.0` cube 模式并拥有 render/resize/dispose。
- [x] GREEN：移除模型“管理”，统一深色输入框；树与属性区独立滚动。
- [x] 运行 Three/editor-web 定向测试、typecheck 和浏览器宽屏验收。

### Task 2：Camera 与漫游 Schema

**Files:**
- Create: `packages/scene-schema/src/camera.ts`
- Modify: `packages/scene-schema/src/schema.ts`
- Modify: `packages/scene-schema/src/defaultDocument.ts`
- Modify: `packages/scene-schema/src/index.ts`
- Test: `packages/scene-schema/tests/schema.test.ts`

**Produces:** `SceneCamera`、`CameraRoamingPath`、`camera`、`cameraRoamingList`。

- [x] RED：旧文档默认值、round-trip、`far <= near`、少于两点、重复路径 ID 测试。
- [x] GREEN：增加有限数 tuple、Camera refine 和路径列表重复 ID refine。
- [x] GREEN：默认文档显式写入 Camera 与空路径。
- [x] 运行 `pnpm --filter @digital-twin/scene-schema test typecheck`。

### Task 3：Camera 与路径撤销命令

**Files:**
- Create: `packages/editor-core/src/commands/UpdateCameraCommand.ts`
- Create: `packages/editor-core/src/commands/UpdateCameraRoamingListCommand.ts`
- Modify: `packages/editor-core/src/index.ts`
- Modify: `apps/editor-web/src/editor/useEditorCommands.ts`
- Test: `packages/editor-core/tests/commands.test.ts`
- Test: `apps/editor-web/tests/editorCommands.test.ts`

**Produces:** `updateCamera(patch)`、`replaceCameraRoamingList(paths)`。

- [x] RED：Camera 和路径执行、undo、redo、深拷贝隔离测试。
- [x] GREEN：实现前后快照命令并通过 `documentStore.execute()`。
- [x] GREEN：Canvas bridge 在命令成功后增量应用 Camera/路径。

### Task 4：共享 CameraRoamingSystem

**Files:**
- Create: `packages/three-engine/src/camera/CameraRoamingSystem.ts`
- Modify: `packages/three-engine/src/index.ts`
- Test: `packages/three-engine/tests/CameraRoamingSystem.test.ts`

**Produces:** `startDrawing()`、`cancelDrawing()`、`preview(path)`、`stopPreview()`、`update(delta)`、`dispose()`。

- [x] RED：Ctrl/Meta、250ms/5px、两点提交、模式互斥、播放常量、零长度段和释放测试。
- [x] GREEN：实现地面射线、编号标记、环/箭头、橙色虚线和 delta 播放。
- [x] GREEN：所有 pointer/keyboard/blur 监听使用稳定引用，切模式和 dispose 对称释放。

### Task 5：EditorEngine Camera 桥接

**Files:**
- Modify: `packages/three-engine/src/EditorEngine.ts`
- Modify: `apps/editor-web/src/components/EditorCanvas.vue`
- Test: `packages/three-engine/tests/EditorEngineCamera.test.ts`
- Test: `apps/editor-web/tests/EditorCanvasBridge.test.ts`

**Produces:** Camera state/read/apply、路径绘制/播放/停止、`camerastatechange`、`cameraroamingstatechange`、`cameraroamingpathcreated`。

- [x] RED：加载文档恢复 Camera/target、投影更新、路径创建事件和 dispose 测试。
- [x] GREEN：初始化共享系统，按漫游 > PointerLock > Camera animation > Orbit 的优先级 update。
- [x] GREEN：reset、切文档、第一人称和测量与漫游互斥。

### Task 6：Camera 检查器和漫游面板

**Files:**
- Create: `apps/editor-web/src/components/editor/CameraInspector.vue`
- Create: `apps/editor-web/src/components/editor/CameraRoamingPanel.vue`
- Modify: `apps/editor-web/src/components/editor/SceneTree.vue`
- Modify: `apps/editor-web/src/views/EditorWorkspace.vue`
- Modify: `apps/editor-web/src/styles/editor.scss`
- Test: `apps/editor-web/tests/CameraInspector.test.ts`
- Test: `apps/editor-web/tests/SceneTree.test.ts`
- Test: `apps/editor-web/tests/EditorWorkspace.test.ts`

- [x] RED：Camera 选择互斥、角度/弧度转换、投影字段、两个页签、路径操作测试。
- [x] GREEN：Camera 行可选择并显示 current；属性通过命令写文档。
- [x] GREEN：新增、播放/停止、删除确认和绘制/漫游提示完整。

### Task 7：Runtime 导航引擎

**Files:**
- Modify: `packages/three-engine/src/RuntimeThreeEngine.ts`
- Modify: `packages/three-engine/src/runtime/RuntimePointerSystem.ts`
- Test: `packages/three-engine/tests/RuntimeThreeEngine.test.ts`

**Produces:** `resetCamera()`、`requestFirstPerson()`、`exitFirstPerson()`、`playCameraRoaming()`、`stopCameraRoaming()`、navigation subscription。

- [x] RED：Camera 恢复、Orbit/第一人称/漫游互斥、reset 和切文档清理测试。
- [x] GREEN：复用 PointerLockSystem 与 CameraRoamingSystem，导航期间停用业务 hover/click。
- [x] GREEN：focus-node/CameraMove 开始前退出其他 Camera 写入模式。

### Task 8：完整预览 UI

**Files:**
- Create: `apps/runtime-web/src/components/RuntimePreviewToolbar.vue`
- Create: `apps/runtime-web/src/components/RuntimeRoamingStatus.vue`
- Create: `apps/runtime-web/src/components/RuntimeLoadingOverlay.vue`
- Modify: `apps/runtime-web/src/RuntimeCanvas.vue`
- Modify: `apps/runtime-web/src/views/RuntimeView.vue`
- Test: `apps/runtime-web/tests/RuntimeCanvas.test.ts`
- Test: `apps/runtime-web/tests/RuntimeView.test.ts`

- [x] RED：Preview 工具栏、空路径提示、命令转发、取消、Loading 阶段和卸载订阅测试。
- [x] GREEN：实现顶部深色浮动工具栏、原生按钮/SVG、键盘下拉和漫游状态层。
- [x] GREEN：API、Engine、素材、SceneRuntime 全阶段 Loading；过期代次不能覆盖新路由。

### Task 9：完整验证与真实场景验收

**Files:**
- Modify: `tests/e2e/editor-foundation.spec.ts`
- Modify: `tests/e2e/runtime-publication.spec.ts`

- [x] 增加 Camera 保存刷新、路径预览、第一人称与 reset E2E。
- [x] 断言 Runtime bundle 不包含 Element Plus、TransformControls 或 IndexedDB，且体积预算不回退。
- [x] 运行 `pnpm verify`。
- [x] 浏览器使用真实 `DEVICE-4x1装配区-114` 场景验收 Camera、路径、拾取、Gizmo、双滚动区和 Preview。
- [x] 检查中文注释、`git diff --check` 后按阶段提交。
