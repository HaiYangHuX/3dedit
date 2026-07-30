# Scene Shader Source Parity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在编辑器、预览和发布运行时中完整复刻原站 13 个 Shader 方法及线上 12 项操作入口。

**Architecture:** 场景协议只保存 `shaderMethod`，Three 引擎用固定工厂重建生产包中的 geometry/material/GLSL。`ShaderSystem` 随 `SceneDocumentSystem` 节点生命周期维护缓存，并由两种 Engine 的唯一 RAF 驱动动画。

**Tech Stack:** Vue 3、TypeScript、Pinia、Element Plus、Three.js r183、Zod、Vitest、Playwright

## Global Constraints

- `three` 必须保持 `0.183.0`，不得引入另一版本或额外 Shader 运行库。
- vertex/fragment GLSL、uniform 默认值、几何参数和动画步进必须使用原站生产包取证值。
- UI 只展示原站当前展示的 12 项，协议和引擎支持含罗盘在内的 13 项。
- 所有代码使用现有唯一 RAF 和资源释放边界，不创建对象级 RAF。
- 新增节点进入撤销历史，但不得触发自动保存。
- 对非显然的源码对齐和生命周期约束添加中文注释。

---

### Task 1: Shader 场景协议

**Files:**
- Create: `packages/scene-schema/src/shader.ts`
- Modify: `packages/scene-schema/src/schema.ts`
- Modify: `packages/scene-schema/src/index.ts`
- Test: `packages/scene-schema/tests/shader.test.ts`

**Interfaces:**
- Produces: `shaderMethodSchema`、`ShaderMethod`、`SHADER_METHODS`、`shaderComponentSchema`

- [ ] 写测试覆盖 13 个合法方法、未知方法拒绝和 SceneDocument 往返。
- [ ] 运行 `pnpm --filter @digital-twin/scene-schema test -- shader.test.ts`，确认测试先失败。
- [ ] 实现强类型 discriminated union 分支并导出公共类型。
- [ ] 重跑测试，确认通过。

### Task 2: 原站 Shader 工厂与动画系统

**Files:**
- Create: `packages/three-engine/src/shaders/createShaderObject.ts`
- Create: `packages/three-engine/src/shaders/ShaderSystem.ts`
- Modify: `packages/three-engine/src/index.ts`
- Test: `packages/three-engine/tests/createShaderObject.test.ts`
- Test: `packages/three-engine/tests/ShaderSystem.test.ts`

**Interfaces:**
- Consumes: `ShaderMethod`
- Produces: `createShaderObject(method): Mesh`、`ShaderSystem.sync()`、`ShaderSystem.update(elapsed)`、`ShaderSystem.clear()`

- [ ] 写失败测试逐项断言 geometry 尺寸/方向、材质参数、uniform 和关键 GLSL 片段。
- [ ] 从生产包逐字迁移 13 个 Shader 工厂及圆角围栏几何生成器。
- [ ] 写失败测试覆盖 `uTime`、`iTime += 0.01`、警告光圈缩放边界和缓存清理。
- [ ] 实现 ShaderSystem，并确认两组测试通过。

### Task 3: SceneDocument 与 Engine 生命周期

**Files:**
- Modify: `packages/three-engine/src/objects/createSceneObject.ts`
- Modify: `packages/three-engine/src/documents/SceneDocumentSystem.ts`
- Modify: `packages/three-engine/src/EditorEngine.ts`
- Modify: `packages/three-engine/src/RuntimeThreeEngine.ts`
- Test: `packages/three-engine/tests/SceneDocumentSystem.test.ts`
- Test: `packages/three-engine/tests/engineSettingsParity.test.ts`

**Interfaces:**
- SceneDocumentSystem 创建 Shader Mesh，并提供 `updateShaders(elapsed): boolean`。
- EditorEngine/RuntimeThreeEngine 每帧调用同一更新入口。

- [ ] 写失败测试覆盖加载、新增、方法替换、删除、释放和动画更新。
- [ ] 将 Shader 作为主组件接入对象创建与 `requiresReplacement`。
- [ ] 在文档节点提交点同步 ShaderSystem，释放时只清缓存引用。
- [ ] 在编辑器和运行时现有 RAF 中接入更新，并确认测试通过。

### Task 4: 编辑器素材、命令和属性展示

**Files:**
- Create: `apps/editor-web/src/editor/shaderPalette.ts`
- Modify: `apps/editor-web/src/editor/createSceneNode.ts`
- Modify: `apps/editor-web/src/editor/scenePaletteDrag.ts`
- Modify: `apps/editor-web/src/editor/useEditorCommands.ts`
- Modify: `apps/editor-web/src/views/EditorWorkspace.vue`
- Modify: `apps/editor-web/src/components/editor/AssetPalette.vue`
- Modify: `apps/editor-web/src/components/editor/NodeInspector.vue`
- Modify: `apps/editor-web/src/components/editor/SceneTree.vue`
- Modify: `apps/editor-web/src/styles/editor.scss`
- Test: `apps/editor-web/tests/scenePaletteDrag.test.ts`
- Test: `apps/editor-web/tests/editorCommands.test.ts`
- Test: `apps/editor-web/tests/EditorWorkspace.test.ts`

**Interfaces:**
- Produces: `SHADER_PALETTE_ITEMS`、`createShaderNode()`、`commands.addShader()`、shader drag payload。

- [ ] 写失败测试覆盖 12 项名称、节点默认值、拖放校验、点击/拖入和撤销。
- [ ] 使用 Element Plus 图标与 tooltip 实现原站列表，移除占位文案。
- [ ] Shader 点击和拖放统一进入 `AddNodeCommand`，水平/落地效果不额外抬高。
- [ ] 场景树和属性面板显示 Shader 类型但不增加 uniform 编辑。
- [ ] 重跑 editor-web 测试并修复样式回归。

### Task 5: 全量验证与浏览器验收

- [ ] 运行 `pnpm format:check`、`pnpm lint`、`pnpm typecheck`、`pnpm test`、`pnpm build` 和 `git diff --check`。
- [ ] 启动前后端与运行时，分别在编辑器中点击和拖入 12 项 Shader。
- [ ] 验证选择、TransformControls、复制、删除、撤销、显式保存和刷新恢复。
- [ ] 打开预览和发布运行时，检查与编辑器效果一致。
- [ ] 检查浏览器控制台无 WebGL shader compile/link error，并用截图和 Canvas 像素变化确认所有动画可见。
