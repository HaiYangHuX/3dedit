# 场景树模型结构与 Camera 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让场景树展示 Camera 和真实 Three.js 模型层级，并把搜索、图标、Tooltip、树行和选中态按源站样式还原。

**Architecture:** `SceneDocumentSystem` 从已加载的 Object3D 导出只读 `ModelStructureMap`，经 `EditorEngine` 和 `EditorCanvas` 事件传到 `SceneTree`。业务树仍由 `SceneDocument` 持久化，模型内部层级只用于展示；Camera 是顶部固定系统项。

**Tech Stack:** Three.js 0.183.0、Vue 3.5.40、TypeScript 5.9.3、Element Plus 2.14.3、Vitest 4.1.10。

## Global Constraints

- Three.js 运行时与类型固定为 0.183.x，不升级依赖。
- Object3D 结构快照不写入 `SceneDocument`、Pinia 持久化、API 或发布产物。
- 模型内部节点只读，不伪造无法持久化的删除、替换或材质编辑功能。
- 业务节点现有选择、更名、复制、显隐、锁定、删除和拖放意图保持不变。
- 所有操作图标和悬浮提示使用 Element Plus，新逻辑使用简洁中文注释。

---

### Task 1: Three.js 模型结构投影

**Files:**
- Modify: `packages/three-engine/src/types.ts`
- Modify: `packages/three-engine/src/index.ts`
- Modify: `packages/three-engine/src/documents/SceneDocumentSystem.ts`
- Modify: `packages/three-engine/src/EditorEngine.ts`
- Test: `packages/three-engine/tests/SceneDocumentSystem.test.ts`

**Interfaces:**
- Produces: `ModelStructureNode`, `ModelStructureMap`, `SceneDocumentSystem.getModelStructures()` 和 `EditorEngine.getModelStructures()`。

- [x] **Step 1: 写入 Three 失败测试**

  构造“模型根 → 命名 Group → Mesh”，同时在模型根下挂载具有 `sceneNodeId` 的业务子节点，期望快照保留前者并排除后者。

- [x] **Step 2: 运行定向测试确认因 API 缺失而失败**

  ```bash
  pnpm --filter @digital-twin/three-engine exec vitest run tests/SceneDocumentSystem.test.ts
  ```

- [x] **Step 3: 实现层级投影并导出类型**

  只从 `primaryComponentKind === 'model'` 的根对象导出内部子树；未命名对象使用 `object.type`；具有自己 `sceneNodeId` 的业务节点不进入投影。

- [x] **Step 4: 运行 Three 定向测试确认通过**

### Task 2: Canvas 层级快照事件

**Files:**
- Modify: `apps/editor-web/src/components/EditorCanvas.vue`
- Modify: `apps/editor-web/src/editor/useEditorCommands.ts`
- Test: `apps/editor-web/tests/EditorCanvasBridge.test.ts`

**Interfaces:**
- Consumes: `EditorEngine.getModelStructures(): ModelStructureMap`。
- Produces: Vue 事件 `model-structure-change` 和增量更新后的新快照。

- [x] **Step 1: 写入 Canvas 失败测试**

  为 mock engine 增加 `getModelStructures`，期望初始加载后 `wrapper.emitted('model-structure-change')` 收到同一快照。

- [x] **Step 2: 运行定向测试确认事件缺失**

  ```bash
  pnpm --filter @digital-twin/editor-web exec vitest run tests/EditorCanvasBridge.test.ts
  ```

- [x] **Step 3: 在加载和增量变更成功后统一发射快照**

  `applyNodeUpdated` 改为可等待 Promise，只在 `engine.updateNode()` 成功后发送，避免 Object3D 替换期间发送旧 UUID。

- [x] **Step 4: 运行 Canvas 定向测试确认通过**

### Task 3: Camera 与可展开模型树

**Files:**
- Modify: `apps/editor-web/src/components/editor/SceneTree.vue`
- Modify: `apps/editor-web/src/views/EditorWorkspace.vue`
- Test: `apps/editor-web/tests/SceneTree.test.ts`
- Test: `apps/editor-web/tests/EditorWorkspace.test.ts`

**Interfaces:**
- Consumes: `modelStructures: ModelStructureMap`。
- Preserves: 业务节点原有 emits，内部 Object3D 单击映射到所属 SceneNode 选择。

- [x] **Step 1: 写入树组件失败测试**

  期望页面有 `[data-testid="scene-camera"]`、模型根 `data-node-id`、嵌套子结构 `data-object-id`、Element SVG 图标和 `ElTooltip`，并且单击内部节点会选中所属模型根。

- [x] **Step 2: 运行定向测试确认 Camera 和子结构缺失**

  ```bash
  pnpm --filter @digital-twin/editor-web exec vitest run tests/SceneTree.test.ts tests/EditorWorkspace.test.ts
  ```

- [x] **Step 3: 重构 SceneTree 的树项边界**

  业务项和模型内部项使用不同 kind；搜索递归保留祖先；内部项禁止拖拽且不显示业务操作。

- [x] **Step 4: 为工作区接入最新快照**

  `EditorWorkspace` 使用 `ref<ModelStructureMap>({})`，处理 `EditorCanvas @model-structure-change` 并把快照传给 `SceneTree`。

- [x] **Step 5: 运行树和工作区测试确认通过**

### Task 4: 源站树样式与 Element 操作区

**Files:**
- Modify: `apps/editor-web/src/styles/editor.scss`
- Modify: `apps/editor-web/src/components/editor/SceneTree.vue`

- [x] **Step 1: 用 Element Plus 组件替换原生搜索和 Emoji**

  使用 `ElInput` + `Search`、`ElScrollbar`、`ElTooltip`，业务操作使用 `EditPen`、`CopyDocument`、`View/Hide`、`Lock/Unlock`、`Delete`。

- [x] **Step 2: 应用源站场景树 CSS 参数**

  搜索区 10px 内边距；Camera 行 `padding: 6px 16px`；树行 28px；树背景 `#0f172a80`；hover/current 左边框；操作按钮 18px。

- [x] **Step 3: 运行前端静态验证**

  ```bash
  pnpm --filter @digital-twin/editor-web typecheck
  pnpm lint
  ```

### Task 5: 全量与真实模型验收

- [x] **Step 1: 运行全量验证**

  ```bash
  CI=1 E2E_EDITOR_BASE_URL='http://127.0.0.1:5273' E2E_RUNTIME_BASE_URL='http://127.0.0.1:5274' pnpm verify
  ```

- [x] **Step 2: 浏览器验证**

  打开 `/editor/local-project/toolbar-check`，使用现有真实模型实例，确认 Camera、可展开 Object3D 子结构、深色背景、青色选中态、Element 图标和 Tooltip。

- [x] **Step 3: 提交**

  ```bash
  git commit -m '💥 feat(Three交互): 还原场景树模型结构'
  ```
