# 视口工具栏 Element 图标与提示实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将视口工具栏的自定义字体图标和原生 `title` 提示替换为 Element Plus 组件，同时保持现有 8 个 Three.js 操作的顺序、状态与事件完全不变。

**Architecture:** `ViewportToolbar.vue` 继续作为无 Three.js 状态的展示组件，每个按钮由 `ElTooltip` 包裹并渲染 `@element-plus/icons-vue` 图标。`editor.scss` 只保留统一的 SVG 图标尺寸与交互态，并删除已无用的 iconfont 定义和字体文件。

**Tech Stack:** Vue 3.5.40、TypeScript 5.9.3、Element Plus 2.14.3、`@element-plus/icons-vue` 2.3.2、Vitest 4.1.10。

## Global Constraints

- 不改动工具栏的 props、emits、`data-tool` 标识、按钮顺序和 Three.js 功能逻辑。
- 保留按钮 `aria-label`，并移除所有原生 `title`，避免与 Element Tooltip 重复弹出。
- 动态状态按钮的 tooltip 文案必须跟随 props 更新。
- 新增或修改的非显然逻辑使用简洁中文注释。

---

### Task 1: 工具栏图标与 Tooltip 组件化

**Files:**
- Modify: `apps/editor-web/tests/ViewportChrome.test.ts`
- Modify: `apps/editor-web/src/components/editor/ViewportToolbar.vue`
- Modify: `apps/editor-web/src/styles/editor.scss`
- Delete: `apps/editor-web/public/fonts/iconfont-C5QZIOO0.woff2`

**Interfaces:**
- Consumes: `ViewportToolbar` 现有 props 与 emits 契约。
- Produces: 8 个 `ElTooltip` 和 8 个 Element Plus SVG 图标；保留原有按钮 DOM 选择器和事件。

- [ ] **Step 1: 写入失败回归测试**

  在视口工具栏用例中导入 `ElTooltip`，验证 8 个 Tooltip、8 个 Element SVG 图标、无 iconfont 节点、无原生 `title`，以及动态文案：

  ```ts
  expect(wrapper.findAllComponents(ElTooltip)).toHaveLength(8);
  expect(wrapper.findAll('.viewport-element-icon')).toHaveLength(8);
  expect(wrapper.find('.iconfont').exists()).toBe(false);
  expect(
    wrapper
      .findAll('.transform-controls-item')
      .every((button) => button.attributes('title') === undefined),
  ).toBe(true);
  expect(
    wrapper.findAllComponents(ElTooltip).map((tooltip) =>
      tooltip.props('content'),
    ),
  ).toEqual([
    '拖拽（快捷键：W）',
    '旋转（快捷键：E）',
    '缩放（快捷键：R）',
    '对齐所有模型到地面',
    '当前视角：第三人称',
    '测量工具',
    '重置场景相机位置（鼠标无法控制相机时）',
    '鼠标单击选中整个模型：已开启',
  ]);
  ```

- [ ] **Step 2: 运行定向测试并确认正确失败**

  Run:

  ```bash
  pnpm --filter @digital-twin/editor-web exec vitest run tests/ViewportChrome.test.ts
  ```

  Expected: FAIL，因当前组件没有 `ElTooltip`、仍有 iconfont 和原生 `title`。

- [ ] **Step 3: 实现最小组件化替换**

  在 `ViewportToolbar.vue` 中：

  - 从 `element-plus` 导入 `ElTooltip`。
  - 从 `@element-plus/icons-vue` 导入 `Rank`、`RefreshRight`、`ScaleToOriginal`、`Bottom`、`UserFilled`、`Avatar`、`EditPen`、`Camera`、`TurnOff`、`Open`。
  - 按照原按钮顺序使用 `ElTooltip placement="top" :show-after="300"`包裹每个按钮。
  - 将自定义 iconfont 节点替换为 Element Plus 图标组件，并移除按钮 `title`。

- [ ] **Step 4: 清理 iconfont 资源并统一 SVG 样式**

  删除 `editor.scss` 内 `@font-face`、`.iconfont` 和六个字形类，将工具栏图标选择器统一为 `.viewport-element-icon`，设置 `width: 15px; height: 15px; flex: none;`。删除字体文件。

- [ ] **Step 5: 运行定向测试并确认通过**

  Run:

  ```bash
  pnpm --filter @digital-twin/editor-web exec vitest run tests/ViewportChrome.test.ts
  ```

  Expected: PASS。

- [ ] **Step 6: 运行前端静态验证与全量验证**

  Run:

  ```bash
  pnpm --filter @digital-twin/editor-web typecheck
  pnpm lint
  CI=1 E2E_EDITOR_BASE_URL='http://127.0.0.1:5273' E2E_RUNTIME_BASE_URL='http://127.0.0.1:5274' pnpm verify
  ```

  Expected: 全部命令退出码为 0。

- [ ] **Step 7: 视觉验收**

  启动本地编辑器后打开 `/editor/local-project/toolbar-check`，确认图标清晰、对齐一致，且每个按钮悬停时只出现一个 Element Plus 提示。

- [ ] **Step 8: 提交实现**

  ```bash
  git add apps/editor-web/tests/ViewportChrome.test.ts \
    apps/editor-web/src/components/editor/ViewportToolbar.vue \
    apps/editor-web/src/styles/editor.scss \
    apps/editor-web/public/fonts/iconfont-C5QZIOO0.woff2
  git commit -m '🌷 UI(Three交互): 优化视口工具栏图标提示'
  ```
