# 编辑器场景加载遮罩实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在场景文档获取和 Three 引擎加载期间，复用现有 HUD SVG 在画布内显示 loading。

**Architecture:** `EditorWorkspace` 向 `EditorCanvas` 传递 Store 场景请求状态，`EditorCanvas` 自身跟踪引擎初始化和文档加载状态。组件将两类场景状态与现有模型添加状态合并，并依赖加载代次防止旧场景请求关闭新遮罩。

**Tech Stack:** Vue 3 Composition API、TypeScript 5.9、Vitest 4、Vue Test Utils、Three.js 0.183

## Global Constraints

- 复用 `/loading/hud-spinner.svg` 和现有画布遮罩样式。
- 场景加载文案为 `场景加载中...`，模型添加文案仍为 `模型加载中...`。
- 加载成功和失败均必须收尾，且旧加载代次不得关闭新场景 loading。
- 不修改 Three Engine 公共 API、SVG 资源或遮罩样式。

---

### Task 1: 接入场景请求状态

**Files:**
- Modify: `apps/editor-web/src/views/EditorWorkspace.vue`
- Test: `apps/editor-web/tests/EditorWorkspace.test.ts`

**Interfaces:**
- Consumes: `saveState: SaveState`
- Produces: `EditorCanvas.sceneLoading: boolean`

- [x] **Step 1: 编写失败测试**

在 `EditorWorkspace.test.ts` 挂载带 `sceneLoading` prop 的 Canvas stub，将 Store 设为 `loading` 并断言 Canvas 收到 `true`；设为 `saved` 后断言变为 `false`。

- [x] **Step 2: 运行测试并确认按预期失败**

Run: `pnpm --filter @digital-twin/editor-web exec vitest run tests/EditorWorkspace.test.ts`

Expected: FAIL，Canvas 尚未收到 `sceneLoading`。

- [x] **Step 3: 实现最小传递**

向 `EditorCanvas` 添加 `:scene-loading="saveState === 'loading'"`。

- [x] **Step 4: 确认目标测试通过**

Run: `pnpm --filter @digital-twin/editor-web exec vitest run tests/EditorWorkspace.test.ts`

Expected: 全部用例通过。

### Task 2: 覆盖引擎加载生命周期

**Files:**
- Modify: `apps/editor-web/src/components/EditorCanvas.vue`
- Test: `apps/editor-web/tests/EditorCanvasBridge.test.ts`

**Interfaces:**
- Consumes: `sceneLoading?: boolean`、`modelLoading?: boolean`、`engine.loadDocument()`
- Produces: 合并加载状态和对应的场景/模型提示文案

- [x] **Step 1: 编写场景引擎加载期间的失败测试**

用可控 Promise 阻塞 `engine.loadDocument()`，断言期间显示同一 SVG 和场景文案，完成后关闭。

- [x] **Step 2: 编写并发代次与异常收尾的失败测试**

连续发起两次文档加载，断言第一次完成后遮罩仍在，第二次失败后遮罩关闭且错误信息保留。

- [x] **Step 3: 实现最小场景加载状态机**

在 `EditorCanvas` 内初始化 `documentLoading` 为真，在当前 `loadGeneration` 的 `finally` 中关闭；初始化失败时同样关闭。用 computed 合并外部场景状态、内部引擎状态和现有模型状态。

- [x] **Step 4: 运行目标验证**

Run:

```bash
pnpm --filter @digital-twin/editor-web exec vitest run tests/EditorCanvasBridge.test.ts tests/EditorWorkspace.test.ts
pnpm --filter @digital-twin/editor-web typecheck
pnpm --filter @digital-twin/editor-web build
```

Expected: 测试、类型检查和构建均退出码 `0`。

### Task 3: 提交并推送

**Files:**
- Commit only: 本计划和场景 loading 相关文件

**Interfaces:**
- Consumes: 已验证的本地改动
- Produces: `origin/main` 上的中文规范提交

- [x] **Step 1: 复核差异和未跟踪文件**

Run: `git status --short && git diff --check && git diff -- <feature-files>`

Expected: 无空白错误，原有一键启动脚本改动未进入本次差异。

- [x] **Step 2: 提交并推送当前主分支**

```bash
git add apps/editor-web/src/components/EditorCanvas.vue \
  apps/editor-web/src/views/EditorWorkspace.vue \
  apps/editor-web/tests/EditorCanvasBridge.test.ts \
  apps/editor-web/tests/EditorWorkspace.test.ts \
  docs/superpowers/specs/2026-07-29-editor-scene-loading-overlay-design.md \
  docs/superpowers/plans/2026-07-29-editor-scene-loading-overlay.md
git commit -m '💥 feat(编辑器): 新增场景加载画布遮罩'
git push origin main
```

Expected: 推送成功，`origin/main` 指向新提交。
