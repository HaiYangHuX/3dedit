# 编辑器地面环境与资源拖放实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 复现 ThreeFlowX r183 的灰色背景、默认 IBL 和双层网格，并让模型、几何体和灯光共享可撤销的视口拖放链。

**Architecture:** `SceneSettingsSystem` 继续拥有背景、雾、网格和用户 HDR 切换；`EditorEngine` 创建并拥有 `RoomEnvironment` 产生的默认 PMREM。Vue 层新增判别联合拖放协议，`EditorCanvas` 只计算世界坐标，`EditorWorkspace` 将 DTO 分派到现有命令 API。

**Tech Stack:** Vue 3.5、TypeScript 5.9、Pinia 4、Three.js `0.183.0`、`@types/three@0.183.1`、Vitest、Vue Test Utils、Playwright。

## Global Constraints

- Three.js runtime `0.183.0` 是 API 最终权威。
- Composer 仍是编辑器每帧唯一最终渲染路径。
- 默认 IBL 和双层网格只属于编辑器，不写入 SceneDocument，不出现在运行时。
- 所有拖放新增仍执行现有 AddNodeCommand，不能直接修改 Store 文档。
- 射线坐标必须来自实际 canvas 矩形。
- 新增复杂逻辑使用有效中文注释，并对称释放 GPU/DOM 资源。

---

### Task 1: 复现线上 r183 编辑环境

**Files:**
- Modify: `packages/scene-schema/src/defaultDocument.ts`
- Modify: `packages/scene-schema/tests/sceneDocument.test.ts`
- Modify: `packages/three-engine/src/EditorEngine.ts`
- Modify: `packages/three-engine/src/settings/SceneSettingsSystem.ts`
- Modify: `packages/three-engine/tests/SceneSettingsSystem.test.ts`

**Interfaces:**
- `SceneSettingsSystemOptions.fallbackEnvironment?: Texture`
- `SceneSettingsSystem.grid?: Group`
- `SceneSettingsSystem.apply(settings)` 同步背景、曝光、编辑雾和两层网格。

- [ ] **Step 1: 写默认背景、双网格和 fallback environment 失败测试**

断言默认文档背景为 `#3b3b3b`、曝光为 `1.2`；编辑系统产生两个 GridHelper，分段分别为 `2000/200`，关闭网格时整个 Group 隐藏；没有 HDR 时 `scene.environment` 指向 fallback texture。

- [ ] **Step 2: 运行测试确认失败**

```bash
pnpm --filter @digital-twin/scene-schema test
pnpm --filter @digital-twin/three-engine test -- SceneSettingsSystem.test.ts
```

Expected: FAIL，当前仍为深色默认值、单层网格且没有 fallback environment。

- [ ] **Step 3: 实现默认环境及所有权**

`EditorEngine.initialize` 使用 r183 `RoomEnvironment` 和 `PMREMGenerator.fromScene` 创建 fallback texture，交给 `SceneSettingsSystem`；用户 HDR 生效时替换，清除时恢复。`dispose` 先解除 scene 引用，再释放用户 target、fallback target、RoomEnvironment 和 generator。

- [ ] **Step 4: 实现双层网格和雾**

两层 GridHelper 放入 editor helper Group，按线上参数设置透明度、颜色、`depthWrite=false` 和 `renderOrder=-1`；`apply` 用场景背景色更新 `FogExp2(0.01)`。

- [ ] **Step 5: 验证 Task 1**

```bash
pnpm --filter @digital-twin/scene-schema test
pnpm --filter @digital-twin/three-engine test -- SceneSettingsSystem.test.ts
pnpm --filter @digital-twin/three-engine typecheck
```

Expected: PASS。

---

### Task 2: 建立模型、几何体和灯光统一拖放协议

**Files:**
- Create: `apps/editor-web/src/editor/scenePaletteDrag.ts`
- Create: `apps/editor-web/tests/scenePaletteDrag.test.ts`
- Modify: `apps/editor-web/src/components/AssetLibraryPanel.vue`
- Modify: `apps/editor-web/src/components/EditorCanvas.vue`
- Modify: `apps/editor-web/src/views/EditorWorkspace.vue`
- Modify: `apps/editor-web/tests/AssetLibraryPanel.test.ts`
- Modify: `apps/editor-web/tests/EditorCanvasBridge.test.ts`
- Modify: `apps/editor-web/tests/EditorWorkspace.test.ts`

**Interfaces:**
- `SCENE_PALETTE_MIME: 'application/x-digital-twin-scene-palette'`
- `writeScenePaletteDrag(dataTransfer, payload): void`
- `readScenePaletteDrag(dataTransfer): ScenePaletteDragPayload | undefined`
- EditorCanvas emits `scene-drop` with payload plus `position`。

- [ ] **Step 1: 写协议和组件失败测试**

覆盖三种判别 payload、非法 JSON/未知格式拒绝、几何体/灯光按钮 `draggable=true`，以及 canvas drop 发出正确世界坐标。

- [ ] **Step 2: 运行测试确认失败**

```bash
pnpm --filter @digital-twin/editor-web test -- scenePaletteDrag.test.ts EditorCanvasBridge.test.ts EditorWorkspace.test.ts
```

Expected: FAIL，协议模块和 `scene-drop` 尚不存在。

- [ ] **Step 3: 实现统一 MIME 和拖放入口**

模型卡、几何体按钮和灯光按钮都写入同一 MIME。Canvas 校验后调用 `engine.getDropPosition`；Workspace 按 `kind` 调用现有命令，几何体和灯光的 Y 最低为 `0.5`。

- [ ] **Step 4: 保留点击行为并补充可发现性**

按钮 title 明确“点击添加或拖入视口”，CSS 使用 `cursor: grab`，drag active 不改变命令行为。

- [ ] **Step 5: 验证 Task 2**

```bash
pnpm --filter @digital-twin/editor-web test -- scenePaletteDrag.test.ts AssetLibraryPanel.test.ts EditorCanvasBridge.test.ts EditorWorkspace.test.ts
pnpm --filter @digital-twin/editor-web typecheck
```

Expected: PASS。

---

### Task 3: 真实浏览器视觉和拖放闭环

**Files:**
- Modify: `tests/e2e/editor-foundation.spec.ts`
- Modify: `tests/e2e/scene-editing.spec.ts`
- Modify: `README.md`

**Interfaces:**
- E2E 通过真实 HTML5 drag/drop 创建几何体和灯光。
- 视口暴露的测试 DTO 继续只包含统计和就绪状态，不暴露 Three.js 实例。

- [ ] **Step 1: 写 E2E 失败断言**

在空场景验证双层网格的编辑器 helper 标记和明亮默认背景；将立方体、点光源拖入 canvas，断言对象数、节点类型和落点位置。

- [ ] **Step 2: 运行窄 E2E**

```bash
pnpm exec playwright test tests/e2e/editor-foundation.spec.ts
```

Expected: 修改实现前拖放失败；实现后 PASS。

- [ ] **Step 3: 浏览器视觉验收**

在 1280×720 下截图，对照 ThreeFlowX 检查灰色背景、网格远近层次、物体可见性、工具条遮挡和右侧面板溢出；检查 console error 为 0。

- [ ] **Step 4: 全量验证**

```bash
pnpm verify
git diff --check
```

Expected: 格式、Lint、类型、单测、构建和 Playwright 全部通过。

- [ ] **Step 5: 更新 README 并提交**

README 记录编辑器默认 IBL、双层网格和三类素材拖放。提交信息使用中文仓库规范。

