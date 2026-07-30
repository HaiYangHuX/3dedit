# Scene Chart And Text Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为场景编辑器、预览和发布运行时增加可编辑、可交互、可释放的图表与文本组件。

**Architecture:** Scene Schema 保存强类型 JSON，Three Engine 使用稳定业务根加组件控制器创建和更新 Canvas 文本、CSS3D ECharts。Editor 通过现有命令历史接入素材和属性面板，RuntimeHost 通过 SceneDocumentSystem 更新真实对象。

**Tech Stack:** Vue 3、TypeScript、Pinia、Element Plus、Three.js 0.183.0、ECharts 5.6.0、Zod、Vitest、Playwright

## Global Constraints

- Three.js 与 `@types/three` 保持当前 0.183.x，不升级版本。
- 场景文档只能包含可序列化 JSON；对象实例和清理函数不得进入协议。
- 不读取或迁移旧的图表/文本占位 `data` 字段。
- 所有持久化继续由显式保存按钮触发。
- 编辑器和运行时必须共享对象创建、增量更新及释放实现。
- 提交信息只描述新增的图表与文本能力。

---

### Task 1: 强类型组件协议与模板默认值

**Files:**
- Create: `packages/scene-schema/src/text.ts`
- Create: `packages/scene-schema/src/chart.ts`
- Create: `packages/scene-schema/tests/chartText.test.ts`
- Modify: `packages/scene-schema/src/schema.ts`
- Modify: `packages/scene-schema/src/index.ts`

**Interfaces:**
- Produces: `TextComponent`, `TextMethod`, `createDefaultTextComponent()`, `ChartComponent`, `ChartType`, `createDefaultChartComponent()`。

- [ ] **Step 1: Write the failing test**

```ts
it('创建 12 种文本和 9 种图表强类型组件', () => {
  expect(TEXT_METHODS).toHaveLength(12);
  expect(CHART_TYPES).toHaveLength(9);
  expect(textComponentSchema.parse(createDefaultTextComponent('CreatePlainTextCanvas')).kind).toBe('text');
  expect(chartComponentSchema.parse(createDefaultChartComponent('pie')).kind).toBe('chart');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `PATH=/opt/homebrew/opt/node@24/bin:$PATH pnpm --filter @digital-twin/scene-schema test -- chartText.test.ts`
Expected: FAIL because the chart/text exports do not exist.

- [ ] **Step 3: Write minimal implementation**

Define discriminated schemas, template constants and JSON-compatible defaults, then replace the generic chart/text branches in `componentSchema`.

- [ ] **Step 4: Run test to verify it passes**

Run: `PATH=/opt/homebrew/opt/node@24/bin:$PATH pnpm --filter @digital-twin/scene-schema test -- chartText.test.ts`
Expected: PASS with no schema warnings.

### Task 2: Canvas 文本对象与更新生命周期

**Files:**
- Create: `packages/three-engine/src/text/TextCanvasFactory.ts`
- Create: `packages/three-engine/src/text/TextObjectController.ts`
- Create: `packages/three-engine/tests/TextObjectController.test.ts`
- Modify: `packages/three-engine/src/objects/createSceneObject.ts`
- Modify: `packages/three-engine/src/documents/SceneDocumentSystem.ts`
- Modify: `packages/three-engine/src/index.ts`

**Interfaces:**
- Consumes: `TextComponent`。
- Produces: `createTextObject(component)`, `updateTextObject(root, component)`, `setTextObjectContent(root, text)`。

- [ ] **Step 1: Write the failing test**

```ts
it('在稳定业务根内切换 Sprite 和 Mesh 并释放旧纹理', () => {
  const root = createTextObject(component, { renderCanvas });
  const first = root.children[0];
  updateTextObject(root, { ...component, textType: 'Mesh' });
  expect(root.children[0]).not.toBe(first);
  expect(root.children[0]).toBeInstanceOf(Mesh);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `PATH=/opt/homebrew/opt/node@24/bin:$PATH pnpm --filter @digital-twin/three-engine test -- TextObjectController.test.ts`
Expected: FAIL because the text controller does not exist.

- [ ] **Step 3: Write minimal implementation**

Implement the 12 canvas renderers, create filtered CanvasTexture, preserve the root transform, and dispose replaced display resources exactly once.

- [ ] **Step 4: Run test to verify it passes**

Run: `PATH=/opt/homebrew/opt/node@24/bin:$PATH pnpm --filter @digital-twin/three-engine test -- TextObjectController.test.ts`
Expected: PASS for creation, update, type switch and runtime content update.

### Task 3: CSS3D ECharts 对象、渲染器与释放

**Files:**
- Create: `packages/three-engine/src/charts/ChartObjectController.ts`
- Create: `packages/three-engine/src/charts/Css3DOverlaySystem.ts`
- Create: `packages/three-engine/tests/ChartObjectController.test.ts`
- Create: `packages/three-engine/tests/Css3DOverlaySystem.test.ts`
- Modify: `packages/three-engine/package.json`
- Modify: `pnpm-lock.yaml`
- Modify: `packages/three-engine/src/objects/createSceneObject.ts`
- Modify: `packages/three-engine/src/documents/SceneDocumentSystem.ts`
- Modify: `packages/three-engine/src/EditorEngine.ts`
- Modify: `packages/three-engine/src/RuntimeThreeEngine.ts`

**Interfaces:**
- Consumes: `ChartComponent`, existing OrbitControls profile and SceneDocumentSystem root.
- Produces: `createChartObject(component, nodeId)`, `updateChartObject(root, component)`, `setChartObjectOption(root, option)`, `disposeSceneComponentObject(root)`, `Css3DOverlaySystem`.

- [ ] **Step 1: Write the failing tests**

```ts
it('创建 ECharts DOM、拾取盒并支持 option 更新和 dispose', () => {
  const root = createChartObject(component, 'chart-1', { echarts: fakeApi });
  expect(root.children.some((child) => child instanceof CSS3DObject)).toBe(true);
  updateChartObject(root, { ...component, width: 640 });
  disposeSceneComponentObject(root);
  expect(instance.dispose).toHaveBeenCalledOnce();
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `PATH=/opt/homebrew/opt/node@24/bin:$PATH pnpm --filter @digital-twin/three-engine test -- ChartObjectController.test.ts Css3DOverlaySystem.test.ts`
Expected: FAIL because chart controller and CSS3D renderer system do not exist.

- [ ] **Step 3: Write minimal implementation**

Add ECharts 5.6.0, create the CSS3DObject plus invisible raycast box, synchronize overlay and primary OrbitControls targets, render and resize the CSS layer, and dispose DOM/ECharts/listeners on every SceneDocumentSystem release path.

- [ ] **Step 4: Run tests to verify they pass**

Run: `PATH=/opt/homebrew/opt/node@24/bin:$PATH pnpm --filter @digital-twin/three-engine test -- ChartObjectController.test.ts Css3DOverlaySystem.test.ts SceneDocumentSystem.test.ts`
Expected: PASS with one ECharts dispose per removed chart.

### Task 4: 编辑器添加、拖放、树图标与属性编辑

**Files:**
- Create: `apps/editor-web/src/editor/chartPalette.ts`
- Create: `apps/editor-web/src/editor/textPalette.ts`
- Create: `apps/editor-web/tests/chartTextPalette.test.ts`
- Modify: `apps/editor-web/src/editor/createSceneNode.ts`
- Modify: `apps/editor-web/src/editor/scenePaletteDrag.ts`
- Modify: `apps/editor-web/src/editor/useEditorCommands.ts`
- Modify: `apps/editor-web/src/views/EditorWorkspace.vue`
- Modify: `apps/editor-web/src/components/editor/NodeInspector.vue`
- Modify: `apps/editor-web/src/components/editor/SceneTree.vue`
- Modify: `apps/editor-web/src/styles/editor.scss`
- Modify: `apps/editor-web/tests/scenePaletteDrag.test.ts`
- Modify: `apps/editor-web/tests/EditorWorkspace.test.ts`

**Interfaces:**
- Consumes: schema template factories and existing AddNodeCommand/UpdateNodeCommand.
- Produces: `createChartNode()`, `createTextNode()`, `commands.addChart()`, `commands.addText()` and chart/text drag payloads.

- [ ] **Step 1: Write the failing component and palette tests**

```ts
it('图表和文本均支持单击添加与统一拖放协议', () => {
  expect(CHART_PALETTE_ITEMS).toHaveLength(9);
  expect(TEXT_PALETTE_ITEMS).toHaveLength(12);
  expect(readScenePaletteDrag(chartTransfer)).toEqual({ kind: 'chart', chartType: 'pie' });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `PATH=/opt/homebrew/opt/node@24/bin:$PATH pnpm --filter @digital-twin/editor-web test -- chartTextPalette.test.ts scenePaletteDrag.test.ts EditorWorkspace.test.ts`
Expected: FAIL because the palettes, payloads and inspector controls are absent.

- [ ] **Step 3: Write minimal implementation**

Add Element Plus icon cards and tooltips, command methods and drop branches. Add text controls and the chart JSON editor; all commits emit `EditableNodePatch.components` through the existing command chain.

- [ ] **Step 4: Run tests to verify they pass**

Run: `PATH=/opt/homebrew/opt/node@24/bin:$PATH pnpm --filter @digital-twin/editor-web test -- chartTextPalette.test.ts scenePaletteDrag.test.ts EditorWorkspace.test.ts`
Expected: PASS and no placeholder copy remains for chart/text categories.

### Task 5: 运行时真实更新与 DOM 交互

**Files:**
- Modify: `packages/three-engine/src/runtime/RuntimeHostAdapter.ts`
- Modify: `packages/three-engine/src/RuntimeThreeEngine.ts`
- Modify: `packages/three-engine/tests/RuntimeHostAdapter.test.ts`
- Modify: `packages/three-engine/tests/SceneDocumentSystem.test.ts`

**Interfaces:**
- Consumes: `SceneDocumentSystem.setText()`, `setChartData()` and chart DOM event subscription.
- Produces: RuntimeHost 的 `set-text` / `set-chart-data` 真实画面更新。

- [ ] **Step 1: Write the failing runtime test**

```ts
it('运行时动作调用文档组件控制器', async () => {
  await adapter.setText('text', '告警');
  await adapter.setChartData('chart', { series: [{ data: [1, 2] }] });
  expect(setText).toHaveBeenCalledWith('text', '告警');
  expect(setChartData).toHaveBeenCalledOnce();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `PATH=/opt/homebrew/opt/node@24/bin:$PATH pnpm --filter @digital-twin/three-engine test -- RuntimeHostAdapter.test.ts SceneDocumentSystem.test.ts`
Expected: FAIL because RuntimeHostAdapter does not call component update ports.

- [ ] **Step 3: Write minimal implementation**

Add optional adapter callbacks, wire them to SceneDocumentSystem, and prefer chart DOM subscriptions over canvas raycasting for chart source interactions while keeping the existing fallback runtimeState.

- [ ] **Step 4: Run test to verify it passes**

Run: `PATH=/opt/homebrew/opt/node@24/bin:$PATH pnpm --filter @digital-twin/three-engine test -- RuntimeHostAdapter.test.ts SceneDocumentSystem.test.ts`
Expected: PASS for real updates and fallback state.

### Task 6: 全量验证、浏览器验收和交付

**Files:**
- Review all files modified in Tasks 1-5.

- [ ] **Step 1: Run repository verification**

```bash
PATH=/opt/homebrew/opt/node@24/bin:$PATH pnpm format
PATH=/opt/homebrew/opt/node@24/bin:$PATH pnpm lint
PATH=/opt/homebrew/opt/node@24/bin:$PATH pnpm typecheck
PATH=/opt/homebrew/opt/node@24/bin:$PATH pnpm test
PATH=/opt/homebrew/opt/node@24/bin:$PATH pnpm build
```

Expected: every command exits 0.

- [ ] **Step 2: Verify in browser**

Start local services, then use the editor to add one text and one chart by click and drag, edit both, undo/redo, save, refresh, preview and open the publication runtime. Confirm chart hover, navigation, text Sprite/Mesh switch and no stale DOM after deletion.

- [ ] **Step 3: Review the diff and comments**

Run: `git diff --check && git status --short && git diff --stat`
Expected: no whitespace errors, only task-related files, and comments explain non-obvious lifecycle behavior.

- [ ] **Step 4: Commit and push**

```bash
git add docs packages apps pnpm-lock.yaml
git commit -m '💥 feat(图表与文本): 新增场景图表和文本组件能力'
git push origin main
```

Expected: local `main` and `origin/main` point to the new commit.
